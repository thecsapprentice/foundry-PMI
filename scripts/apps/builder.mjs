// The DM-guided builder. Drafts live only in this window until the DM clicks Create.
import { MODULE_ID, RARITIES, SLOTS } from "../config.mjs";
import { newSeed, Rng } from "../generator/rng.mjs";
import { randomBase, randomRarity } from "../generator/random.mjs";
import { categorize, isMundane, appliesTo, kindOf } from "../generator/categories.mjs";
import {
  newRecipe, roll, rerollPick, rerollParams, addPick, removePick, toggleLock, tally, invalidPicks, blockReason,
} from "../generator/roller.mjs";
import { substitute, plain, spellSpecs } from "../generator/params.mjs";
import { compile } from "../compiler/index.mjs";
import { getChangeType, getProperty, listProperties } from "../api.mjs";
import { basePacks, ensurePmiFolder, recipeOf } from "../util.mjs";
import { BASE_INDEX_FIELDS, loadSpellPool } from "../settings.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PmiBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pmi-builder",
    classes: ["pmi-builder"],
    tag: "div",
    window: { title: "PMI.Builder.Title", icon: "fa-solid fa-wand-sparkles", resizable: true },
    position: { width: 640, height: 720 },
    actions: {
      roll: PmiBuilder.#onRoll,
      randomBase: PmiBuilder.#onRandomBase,
      randomRarity: PmiBuilder.#onRandomRarity,
      lock: PmiBuilder.#onLock,
      reroll: PmiBuilder.#onReroll,
      rerollParams: PmiBuilder.#onRerollParams,
      remove: PmiBuilder.#onRemove,
      add: PmiBuilder.#onAdd,
      create: PmiBuilder.#onCreate,
      clearBase: PmiBuilder.#onClearBase,
    },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/builder.hbs`, scrollable: [".pmi-scroll"] },
  };

  static #instance = null;

  /** Draft recipe. Plain JSON; never a live document or flag object. */
  recipe = newRecipe({ seed: newSeed() });

  /** Source data of the chosen base item (a copy), and its index entries for the picker. */
  #base = null;
  #baseIndex = null;
  #spellPool = null;
  #busy = false;
  #dropBound = false;

  /**
   * Open the builder. GM only: players never see drafts.
   * @param {Item} [fromItem]  A PMI item to start from. Creating saves a new copy; the original is untouched.
   */
  static async open(fromItem) {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("PMI.Builder.GMOnly"));
      return null;
    }
    const app = (PmiBuilder.#instance ??= new PmiBuilder());
    if (fromItem) {
      const recipe = recipeOf(fromItem);
      if (!recipe) { ui.notifications.warn(game.i18n.localize("PMI.Builder.NotPmi")); return null; }
      app.recipe = recipe;
      // If the recipe's base is gone or no longer acceptable, start without a base rather than keep a stale one.
      if (!(await app.#setBase(recipe.baseUuid, { quiet: false }))) {
        app.#base = null;
        app.recipe.baseUuid = null;
      }
    }
    app.render({ force: true });
    return app;
  }

  /** Forget the cached base-item list (the GM changed which compendiums to use). */
  static invalidateBases() {
    const app = PmiBuilder.#instance;
    if (!app) return;
    app.#baseIndex = null;
    if (app.rendered) app.render();
  }

  /** Forget the cached spell list (the GM changed which compendiums to use). */
  static invalidateSpells() {
    const app = PmiBuilder.#instance;
    if (!app) return;
    app.#spellPool = null;
    if (app.rendered) app.render();
  }

  /* ---------------------------------------- data ---------------------------------------- */

  get #properties() {
    return listProperties();
  }

  get #categories() {
    return this.#base ? categorize(this.#base) : [];
  }

  async #loadBaseIndex() {
    if (this.#baseIndex) return this.#baseIndex;
    const out = [];
    for (const pack of basePacks()) {
      const index = await pack.getIndex({ fields: BASE_INDEX_FIELDS });
      for (const e of index) {
        if (!categorize(e).length || !isMundane(e)) continue;
        out.push({ uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`, name: e.name, group: pack.metadata.label, kind: kindOf(categorize(e)) });
      }
    }
    out.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    return (this.#baseIndex = out);
  }

  async #loadSpells() {
    return (this.#spellPool ??= await loadSpellPool());
  }

  /** Load a base item by UUID. Only mundane weapons, armor and shields are accepted. */
  async #setBase(uuid, { quiet = true } = {}) {
    if (!uuid) { this.#base = null; this.recipe.baseUuid = null; return false; }
    const doc = await fromUuid(uuid);
    const reject = (key) => { if (!quiet) ui.notifications.warn(game.i18n.localize(key)); return false; };
    if (!(doc instanceof Item)) return reject("PMI.Builder.BaseMissing");
    const data = doc.toObject();
    if (!categorize(data).length) return reject("PMI.Builder.BaseUnsupported");
    if (!isMundane(data)) return reject("PMI.Builder.BaseMagical");
    this.#base = data;
    this.recipe.baseUuid = uuid;
    return true;
  }

  #compile() {
    if (!this.#base) return { data: null, errors: [], warnings: [] };
    return compile(this.recipe, this.#base, {
      getDef: getProperty,
      getTranslator: getChangeType,
      localize: (k) => game.i18n.localize(k),
    });
  }

  #label(def, pick) {
    return substitute(def.label ?? def.name ?? def.id, { ...pick.params, rarity: this.recipe.rarity });
  }

  async _prepareContext() {
    const L = (k) => game.i18n.localize(k);
    const spells = await this.#loadSpells();
    const props = this.#properties;
    const cats = this.#categories;
    const t = tally(this.recipe, getProperty);
    const invalid = new Map(invalidPicks(this.recipe, { properties: props, categories: cats }).map((x) => [x.index, x.reason]));

    const picks = this.recipe.picks.map((pick, index) => {
      const def = getProperty(pick.id);
      return {
        index,
        locked: pick.locked,
        label: def ? this.#label(def, pick) : pick.id,
        slot: def ? L(`PMI.Slot.${def.slot}`) : "?",
        cost: def?.cost ?? 0,
        hasParams: !!def && Object.keys(def.params ?? {}).length > 0,
        params: Object.entries(pick.params ?? {}).map(([k, v]) => `${k}: ${v?.label ?? plain(v)}`).join(", "),
        problem: invalid.has(index) ? L(`PMI.Reason.${invalid.get(index)}`) : null,
      };
    });

    // Properties the DM can add by hand: those that fit the base and rarity, budget aside.
    const addable = this.#base ? props
      .filter((d) => appliesTo(d, cats))
      .map((d) => ({ d, reason: blockReason(d, this.recipe, cats, getProperty, { ignoreBudget: true, spells }) }))
      .filter((x) => !x.reason)
      .sort((a, b) => SLOTS.indexOf(a.d.slot) - SLOTS.indexOf(b.d.slot) || a.d.id.localeCompare(b.d.id))
      .map(({ d }) => ({ id: d.id, label: `${String(d.label ?? d.name ?? d.id).replace(/\{[^}]+\}/g, "…")} (${L(`PMI.Slot.${d.slot}`)}, ${d.cost})`, over: d.cost > t.remaining }))
      : [];

    const compiled = this.#compile();
    const preview = compiled.data ? {
      name: compiled.data.name,
      img: compiled.data.img,
      attunement: compiled.data.system.attunement === "required",
      description: await TextEditor.enrichHTML(compiled.data.system.description.value, { async: true }),
    } : null;

    const bases = await this.#loadBaseIndex();
    return {
      recipe: this.recipe,
      rarities: RARITIES.map((key) => ({ key, label: L(CONFIG.DND5E?.itemRarity?.[key] ?? key), selected: key === this.recipe.rarity })),
      bases: bases.map((b) => ({ ...b, selected: b.uuid === this.recipe.baseUuid })),
      baseKinds: ["any", "weapon", "armor", "shield", "staff", "wand", "rod"].map((kind) => ({
        kind,
        label: L(`PMI.Builder.Kind.${kind}`),
        disabled: kind !== "any" && !bases.some((b) => b.kind === kind),
      })),
      noBases: bases.length === 0,
      baseName: this.#base?.name ?? null,
      baseImg: this.#base?.img ?? null,
      picks,
      addable,
      tally: { ...t, over: t.remaining < 0, percent: Math.min(100, Math.round((t.spent / Math.max(1, t.budget)) * 100)) },
      preview,
      errors: compiled.errors,
      warnings: compiled.warnings,
      canCreate: !!compiled.data && !this.#busy,
      busy: this.#busy,
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;
    el.querySelector("select[name=rarity]")?.addEventListener("change", (ev) => {
      this.recipe.rarity = ev.currentTarget.value;
      this.render();
    });
    el.querySelector("select[name=base]")?.addEventListener("change", async (ev) => {
      await this.#setBase(ev.currentTarget.value || null, { quiet: false });
      this.render();
    });
    // Drop any mundane weapon, armor or shield (from the sidebar or a compendium) to use it as the base.
    // The window element survives re-renders, so bind these only once.
    if (this.#dropBound) return;
    this.#dropBound = true;
    el.addEventListener("dragover", (ev) => ev.preventDefault());
    el.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      const data = TextEditor.getDragEventData(ev);
      if (data?.type !== "Item" || !data.uuid) return;
      if (await this.#setBase(data.uuid, { quiet: false })) this.render();
    });
  }

  /* ---------------------------------------- actions ---------------------------------------- */

  #needBase() {
    if (this.#base) return true;
    ui.notifications.warn(game.i18n.localize("PMI.Builder.ChooseBase"));
    return false;
  }

  #ctx() {
    return { properties: this.#properties, categories: this.#categories, spells: this.#spellPool ?? [] };
  }

  static async #onRoll() {
    if (!this.#needBase()) return;
    await this.#loadSpells();
    this.recipe = roll({ ...this.recipe, rerolls: (this.recipe.rerolls ?? 0) + 1 }, this.#ctx());
    this.render();
  }

  /** Pick a random base item of the kind on the button ("any", "weapon", "armor", "shield"). */
  static async #onRandomBase(event, target) {
    const kind = target.dataset.kind ?? "any";
    const entry = randomBase(await this.#loadBaseIndex(), kind, new Rng(newSeed()), this.recipe.baseUuid);
    if (!entry) {
      ui.notifications.warn(game.i18n.localize(`PMI.Builder.NoBaseOfKind.${kind}`));
      return;
    }
    if (await this.#setBase(entry.uuid, { quiet: false })) this.render();
  }

  static #onRandomRarity() {
    this.recipe.rarity = randomRarity(new Rng(newSeed()), this.recipe.rarity);
    this.render();
  }

  static #onLock(event, target) {
    this.recipe = toggleLock(this.recipe, Number(target.dataset.index));
    this.render();
  }

  static async #onReroll(event, target) {
    await this.#loadSpells();
    const next = rerollPick(this.recipe, Number(target.dataset.index), this.#ctx());
    if (!next) { ui.notifications.info(game.i18n.localize("PMI.Builder.NoAlternative")); return; }
    this.recipe = next;
    this.render();
  }

  static async #onRerollParams(event, target) {
    await this.#loadSpells();
    const next = rerollParams(this.recipe, Number(target.dataset.index), this.#ctx());
    if (next) { this.recipe = next; this.render(); }
  }

  static #onRemove(event, target) {
    this.recipe = removePick(this.recipe, Number(target.dataset.index));
    this.render();
  }

  static async #onAdd() {
    if (!this.#needBase()) return;
    const id = this.element.querySelector("select[name=addProperty]")?.value;
    const def = id && getProperty(id);
    if (!def) return;
    try {
      this.recipe = addPick(this.recipe, def, { spells: await this.#loadSpells() });
    } catch (err) {
      ui.notifications.warn(err.message);
      return;
    }
    this.render();
  }

  /** Every spell the recipe uses must still exist (a compendium may have been removed). Returns missing names. */
  async #missingSpells() {
    const missing = [];
    for (const pick of this.recipe.picks) {
      for (const v of Object.values(pick.params ?? {})) {
        if (v && typeof v === "object" && v.uuid && !(await fromUuid(v.uuid))) missing.push(v.name ?? v.uuid);
      }
    }
    return missing;
  }

  static #onClearBase() {
    this.#base = null;
    this.recipe.baseUuid = null;
    this.render();
  }

  /** Create the item: validate, then create it hidden from players in PMI's folder. */
  static async #onCreate() {
    if (this.#busy || !game.user.isGM) return;
    const { data, errors } = this.#compile();
    if (!data || errors.length) { ui.notifications.error(game.i18n.localize("PMI.Builder.HasErrors")); return; }
    this.#busy = true;
    this.render();
    try {
      // Fail safe: don't create an item whose spells can't be found.
      const missing = await this.#missingSpells();
      if (missing.length) {
        ui.notifications.error(game.i18n.format("PMI.Builder.SpellMissing", { names: missing.join(", ") }));
        return;
      }
      // Rule 14: validate before writing. Constructing the document runs dnd5e's data model validation.
      try {
        new Item.implementation(foundry.utils.deepClone(data));
      } catch (err) {
        console.error(`${MODULE_ID} | Generated item failed validation`, err, data);
        ui.notifications.error(game.i18n.format("PMI.Builder.Invalid", { message: err.message }));
        return;
      }
      const folder = await ensurePmiFolder();
      const item = await Item.implementation.create({
        ...data,
        folder: folder.id,
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
      });
      if (item) {
        ui.notifications.info(game.i18n.format("PMI.Builder.Created", { name: item.name }));
        item.sheet.render(true);
      }
    } finally {
      this.#busy = false;
      this.render();
    }
  }
}
