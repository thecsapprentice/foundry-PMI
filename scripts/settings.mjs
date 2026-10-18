// Module settings, and the GM-only forms for choosing base-item and spell compendiums.
import { MODULE_ID, DEFAULT_BASE_PACKS, DEFAULT_SPELL_PACKS, DEFAULT_LIMITS, DEFAULT_CURSE_CHANCE, RARITIES } from "./config.mjs";
import { categorize, isMundane, propertyList } from "./generator/categories.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Index fields needed to tell whether a compendium entry is a usable base item. */
export const BASE_INDEX_FIELDS = ["system.type", "system.rarity", "system.properties", "system.magicalBonus", "system.armor.magicalBonus"];

/** Index fields needed to summarise a spell for the spell filters. */
export const SPELL_INDEX_FIELDS = ["system.level", "system.school", "system.properties", "system.activation.type"];

/**
 * Compendium index entries are raw, unmigrated data, so one odd entry from an old module mustn't break the
 * whole list: anything that can't be read is skipped (and noted once in the console).
 */
let skippedNoted = false;
function safely(test) {
  return (e) => {
    try {
      return test(e);
    } catch (err) {
      if (!skippedNoted) {
        skippedNoted = true;
        console.warn(`${MODULE_ID} | Skipped a compendium entry PMI couldn't read ("${e?.name}"); others may be skipped too.`, err);
      }
      return false;
    }
  };
}
export const isBase = safely((e) => categorize(e).length > 0 && isMundane(e));
const isSpell = safely((e) => e.type === "spell" && Number.isInteger(e.system?.level));

/**
 * @param {object} handlers
 * @param {() => void} handlers.onBasePacksChange   Called when a GM saves new base sources.
 * @param {() => void} handlers.onSpellPacksChange  Called when a GM saves new spell sources.
 */
/** Settings-menu entry that opens the builder (a second way in, whatever the sidebar looks like). */
let openBuilderFn = null;

/**
 * Settings-menu entry that opens the builder (a second way in, whatever the sidebar looks like).
 * Foundry only accepts menu classes that are real applications, so this is an ApplicationV2 that opens
 * the builder instead of drawing a window of its own.
 */
export class PmiBuilderLauncher extends ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "pmi-builder-launcher", window: { title: "PMI.Settings.OpenBuilder.Name" } };
  async render() {
    openBuilderFn?.();
    return this;
  }
}

/**
 * Register PMI's settings, then its settings menus. The settings come first and each menu is registered on
 * its own, so a problem with one menu can never leave the settings unregistered.
 * @returns {string[]} Problems, if any (also logged).
 */
export function registerSettings({ onBasePacksChange, onSpellPacksChange, onGenerationChange, openBuilder } = {}) {
  openBuilderFn = openBuilder;
  const problems = [];
  const attempt = (label, fn) => {
    try { fn(); } catch (err) { problems.push(label); console.error(`${MODULE_ID} | Couldn't register ${label}`, err); }
  };

  attempt("setting basePacks", () => game.settings.register(MODULE_ID, "basePacks", {
    scope: "world", config: false, type: Array, default: [...DEFAULT_BASE_PACKS], onChange: () => onBasePacksChange?.(),
  }));
  attempt("setting spellPacks", () => game.settings.register(MODULE_ID, "spellPacks", {
    scope: "world", config: false, type: Array, default: [...DEFAULT_SPELL_PACKS], onChange: () => onSpellPacksChange?.(),
  }));

  // How strong and how cursed generated items are. Read when rolling, so changes apply to the next roll.
  attempt("setting powerTier", () => game.settings.register(MODULE_ID, "powerTier", {
    name: "PMI.Settings.PowerTier.Name", hint: "PMI.Settings.PowerTier.Hint",
    scope: "world", config: true, type: String, default: DEFAULT_LIMITS.tier,
    choices: Object.fromEntries(TIER_CHOICES.map((r) => [r, `PMI.Settings.PowerTier.${r}`])),
    onChange: () => onGenerationChange?.(),
  }));
  attempt("setting maxAbilityScore", () => game.settings.register(MODULE_ID, "maxAbilityScore", {
    name: "PMI.Settings.MaxAbilityScore.Name", hint: "PMI.Settings.MaxAbilityScore.Hint",
    scope: "world", config: true, type: Number, default: DEFAULT_LIMITS.abilityScore,
    range: { min: 19, max: 30, step: 1 }, onChange: () => onGenerationChange?.(),
  }));
  attempt("setting maxBonus", () => game.settings.register(MODULE_ID, "maxBonus", {
    name: "PMI.Settings.MaxBonus.Name", hint: "PMI.Settings.MaxBonus.Hint",
    scope: "world", config: true, type: Number, default: DEFAULT_LIMITS.bonus,
    range: { min: 1, max: 3, step: 1 }, onChange: () => onGenerationChange?.(),
  }));
  attempt("setting curseChance", () => game.settings.register(MODULE_ID, "curseChance", {
    name: "PMI.Settings.CurseChance.Name", hint: "PMI.Settings.CurseChance.Hint",
    scope: "world", config: true, type: Number, default: Math.round(DEFAULT_CURSE_CHANCE * 100),
    range: { min: 0, max: 100, step: 5 }, onChange: () => onGenerationChange?.(),
  }));

  attempt("menu openBuilder", () => game.settings.registerMenu(MODULE_ID, "openBuilder", {
    name: "PMI.Settings.OpenBuilder.Name", label: "PMI.Settings.OpenBuilder.Label", hint: "PMI.Settings.OpenBuilder.Hint",
    icon: "fa-solid fa-wand-sparkles", type: PmiBuilderLauncher, restricted: true,
  }));
  attempt("menu basePacksMenu", () => game.settings.registerMenu(MODULE_ID, "basePacksMenu", {
    name: "PMI.Settings.BasePacks.Name", label: "PMI.Settings.BasePacks.Label", hint: "PMI.Settings.BasePacks.Hint",
    icon: "fa-solid fa-book", type: PmiBaseSourcesConfig, restricted: true,
  }));
  attempt("menu spellPacksMenu", () => game.settings.registerMenu(MODULE_ID, "spellPacksMenu", {
    name: "PMI.Settings.SpellPacks.Name", label: "PMI.Settings.SpellPacks.Label", hint: "PMI.Settings.SpellPacks.Hint",
    icon: "fa-solid fa-hat-wizard", type: PmiSpellSourcesConfig, restricted: true,
  }));
  return problems;
}

/** Rarities the strongest-effects setting offers. */
const TIER_CHOICES = ["uncommon", "rare", "veryRare", "legendary"];

/** A setting's saved value, or `fallback` if it's unregistered, unreadable or fails `ok` (fail safe). */
function read(key, fallback, ok) {
  try {
    const v = game.settings.get(MODULE_ID, key);
    return ok(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/** The GM's power limits for generation (see DEFAULT_LIMITS). */
export function powerLimits() {
  const whole = (lo, hi) => (v) => Number.isInteger(v) && v >= lo && v <= hi;
  return {
    tier: read("powerTier", DEFAULT_LIMITS.tier, (v) => TIER_CHOICES.includes(v) && RARITIES.includes(v)),
    abilityScore: read("maxAbilityScore", DEFAULT_LIMITS.abilityScore, whole(19, 30)),
    bonus: read("maxBonus", DEFAULT_LIMITS.bonus, whole(1, 3)),
  };
}

/** The chance (0–1) that a random roll adds a drawback. */
export function curseChance() {
  return read("curseChance", Math.round(DEFAULT_CURSE_CHANCE * 100), (v) => Number.isFinite(v) && v >= 0 && v <= 100) / 100;
}

/** A saved list of compendium ids, or the defaults if it's unset, malformed or (fail safe) not registered. */
const chosen = (key, defaults) => {
  let saved;
  try {
    saved = game.settings.get(MODULE_ID, key);
  } catch {
    return defaults;
  }
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
      const props = propertyList(e.system.properties);
      const has = (p) => props.includes(p);
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
