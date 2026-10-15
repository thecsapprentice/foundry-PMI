// Module settings, and the GM-only forms for choosing base-item and spell compendiums.
import { MODULE_ID, DEFAULT_BASE_PACKS, DEFAULT_SPELL_PACKS } from "./config.mjs";
import { categorize, isMundane } from "./generator/categories.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Index fields needed to tell whether a compendium entry is a usable base item. */
export const BASE_INDEX_FIELDS = ["system.type", "system.rarity", "system.properties", "system.magicalBonus", "system.armor.magicalBonus"];

/** Index fields needed to summarise a spell for the spell filters. */
export const SPELL_INDEX_FIELDS = ["system.level", "system.school", "system.properties", "system.activation.type"];

const isBase = (e) => categorize(e).length > 0 && isMundane(e);
const isSpell = (e) => e.type === "spell" && Number.isInteger(e.system?.level);

/**
 * @param {object} handlers
 * @param {() => void} handlers.onBasePacksChange   Called when a GM saves new base sources.
 * @param {() => void} handlers.onSpellPacksChange  Called when a GM saves new spell sources.
 */
export function registerSettings({ onBasePacksChange, onSpellPacksChange } = {}) {
  game.settings.register(MODULE_ID, "basePacks", {
    scope: "world",
    config: false,
    type: Array,
    default: [...DEFAULT_BASE_PACKS],
    onChange: () => onBasePacksChange?.(),
  });
  game.settings.registerMenu(MODULE_ID, "basePacksMenu", {
    name: "PMI.Settings.BasePacks.Name",
    label: "PMI.Settings.BasePacks.Label",
    hint: "PMI.Settings.BasePacks.Hint",
    icon: "fa-solid fa-book",
    type: PmiBaseSourcesConfig,
    restricted: true,
  });
  game.settings.register(MODULE_ID, "spellPacks", {
    scope: "world",
    config: false,
    type: Array,
    default: [...DEFAULT_SPELL_PACKS],
    onChange: () => onSpellPacksChange?.(),
  });
  game.settings.registerMenu(MODULE_ID, "spellPacksMenu", {
    name: "PMI.Settings.SpellPacks.Name",
    label: "PMI.Settings.SpellPacks.Label",
    hint: "PMI.Settings.SpellPacks.Hint",
    icon: "fa-solid fa-hat-wizard",
    type: PmiSpellSourcesConfig,
    restricted: true,
  });
}

const chosen = (key, defaults) => {
  const saved = game.settings.get(MODULE_ID, key);
  return Array.isArray(saved) ? saved : defaults;
};

/** Compendium ids the GM chose for base items, or the defaults. */
export function chosenBasePackIds() {
  return chosen("basePacks", DEFAULT_BASE_PACKS);
}

/** Compendium ids the GM chose for spells, or the defaults. */
export function chosenSpellPackIds() {
  return chosen("spellPacks", DEFAULT_SPELL_PACKS);
}

/** How many usable base items (mundane weapons, armor, shields, wands, staves, rods) a compendium has. */
export async function countBaseItems(pack) {
  const index = await pack.getIndex({ fields: BASE_INDEX_FIELDS });
  return index.filter(isBase).length;
}

/** How many spells a compendium has. */
export async function countSpells(pack) {
  const index = await pack.getIndex({ fields: SPELL_INDEX_FIELDS });
  return index.filter(isSpell).length;
}

/** Shared form: tick the Item compendiums to use. Subclasses say which setting and what to count. */
class PmiSourcesConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static SETTING = "";
  static STRINGS = "";
  static count = async () => 0;
  static chosenIds = () => [];

  static DEFAULT_OPTIONS = {
    classes: ["pmi-sources"],
    tag: "form",
    window: { icon: "fa-solid fa-book" },
    position: { width: 480, height: "auto" },
    form: { handler: PmiSourcesConfig.#onSubmit, closeOnSubmit: true },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/sources.hbs` },
  };

  get title() {
    return game.i18n.localize(`PMI.Settings.${this.constructor.STRINGS}.Name`);
  }

  async _prepareContext() {
    const C = this.constructor;
    const ids = new Set(C.chosenIds());
    const packs = [];
    for (const pack of game.packs.filter((p) => p.documentName === "Item")) {
      const count = await C.count(pack);
      if (!count) continue; // nothing usable: don't clutter the list
      packs.push({
        id: pack.collection,
        label: pack.metadata.label,
        source: pack.metadata.packageType === "world" ? game.i18n.localize("PMI.Settings.World")
          : (game.system.id === pack.metadata.packageName ? game.system.title : game.modules.get(pack.metadata.packageName)?.title ?? pack.metadata.packageName),
        count,
        checked: ids.has(pack.collection),
      });
    }
    packs.sort((a, b) => a.source.localeCompare(b.source) || a.label.localeCompare(b.label));
    const S = `PMI.Settings.${C.STRINGS}`;
    return { packs, hint: game.i18n.localize(`${S}.Hint`), none: game.i18n.localize(`${S}.None`) };
  }

  /** GM only: saves the ticked compendium ids to this form's world setting. */
  static async #onSubmit(event, form) {
    if (!game.user.isGM) return;
    const ids = [...form.querySelectorAll("input[name=pack]:checked")].map((i) => i.value).filter((id) => game.packs.has(id));
    await game.settings.set(MODULE_ID, this.constructor.SETTING, ids);
  }
}

export class PmiBaseSourcesConfig extends PmiSourcesConfig {
  static SETTING = "basePacks";
  static STRINGS = "BasePacks";
  static count = countBaseItems;
  static chosenIds = chosenBasePackIds;
  static DEFAULT_OPTIONS = { id: "pmi-base-sources" };
}

export class PmiSpellSourcesConfig extends PmiSourcesConfig {
  static SETTING = "spellPacks";
  static STRINGS = "SpellPacks";
  static count = countSpells;
  static chosenIds = chosenSpellPackIds;
  static DEFAULT_OPTIONS = { id: "pmi-spell-sources", window: { icon: "fa-solid fa-hat-wizard" } };
}

/**
 * Summaries of every spell in the chosen spell compendiums, for the spell filters:
 * { uuid, name, level, school, classes, concentration, ritual, activation }.
 * Class lists come from dnd5e's spell list registry; spells with no list data match any class filter.
 */
export async function loadSpellPool() {
  const lists = globalThis.dnd5e?.registry?.spellLists;
  const out = [];
  for (const id of chosenSpellPackIds()) {
    const pack = game.packs.get(id);
    if (pack?.documentName !== "Item") continue;
    const index = await pack.getIndex({ fields: SPELL_INDEX_FIELDS });
    for (const e of index) {
      if (!isSpell(e)) continue;
      const uuid = e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`;
      const props = e.system.properties ?? [];
      const has = (p) => (Array.isArray(props) ? props.includes(p) : !!props.has?.(p));
      let classes = [];
      try {
        classes = [...(lists?.forSpell?.(uuid) ?? [])].filter((l) => l.metadata?.type === "class").map((l) => l.metadata.identifier);
      } catch { /* registry not ready: no class data */ }
      out.push({
        uuid, name: e.name, level: e.system.level, school: e.system.school ?? "",
        classes, concentration: has("concentration"), ritual: has("ritual"),
        activation: e.system.activation?.type ?? "",
      });
    }
  }
  return out;
}
