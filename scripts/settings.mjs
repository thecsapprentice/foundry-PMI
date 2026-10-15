// Module settings, and the GM-only form for choosing base-item compendiums.
import { MODULE_ID, DEFAULT_BASE_PACKS } from "./config.mjs";
import { categorize, isMundane } from "./generator/categories.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Index fields needed to tell whether a compendium entry is a usable base item. */
export const BASE_INDEX_FIELDS = ["system.type", "system.rarity", "system.properties", "system.magicalBonus", "system.armor.magicalBonus"];

/** @param {() => void} onBasePacksChange  Called when a GM saves a new list. */
export function registerSettings(onBasePacksChange) {
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
    type: PmiSourcesConfig,
    restricted: true,
  });
}

/** Compendium ids the GM chose, or the defaults if they haven't chosen. */
export function chosenBasePackIds() {
  const saved = game.settings.get(MODULE_ID, "basePacks");
  return Array.isArray(saved) ? saved : DEFAULT_BASE_PACKS;
}

/** How many usable base items (mundane weapons, armor, shields) a compendium has. */
export async function countBaseItems(pack) {
  const index = await pack.getIndex({ fields: BASE_INDEX_FIELDS });
  let n = 0;
  for (const e of index) if (categorize(e).length && isMundane(e)) n++;
  return n;
}

export class PmiSourcesConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pmi-sources",
    classes: ["pmi-sources"],
    tag: "form",
    window: { title: "PMI.Settings.BasePacks.Name", icon: "fa-solid fa-book" },
    position: { width: 480, height: "auto" },
    form: { handler: PmiSourcesConfig.#onSubmit, closeOnSubmit: true },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/sources.hbs` },
  };

  async _prepareContext() {
    const chosen = new Set(chosenBasePackIds());
    const packs = [];
    for (const pack of game.packs.filter((p) => p.documentName === "Item")) {
      const count = await countBaseItems(pack);
      if (!count) continue; // nothing usable as a base: don't clutter the list
      packs.push({
        id: pack.collection,
        label: pack.metadata.label,
        source: pack.metadata.packageType === "world" ? game.i18n.localize("PMI.Settings.BasePacks.World")
          : (game.system.id === pack.metadata.packageName ? game.system.title : game.modules.get(pack.metadata.packageName)?.title ?? pack.metadata.packageName),
        count,
        checked: chosen.has(pack.collection),
      });
    }
    packs.sort((a, b) => a.source.localeCompare(b.source) || a.label.localeCompare(b.label));
    return { packs };
  }

  /** GM only: saves the ticked compendium ids to the world setting. */
  static async #onSubmit(event, form) {
    if (!game.user.isGM) return;
    const ids = [...form.querySelectorAll("input[name=pack]:checked")].map((i) => i.value).filter((id) => game.packs.has(id));
    await game.settings.set(MODULE_ID, "basePacks", ids);
  }
}
