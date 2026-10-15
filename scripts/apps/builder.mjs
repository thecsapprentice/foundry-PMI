// The DM-guided builder window. For now it only opens and shows its shell; drafting comes next.
import { MODULE_ID, RARITIES } from "../config.mjs";
import { newSeed } from "../generator/rng.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PmiBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pmi-builder",
    classes: ["pmi-builder"],
    tag: "div",
    window: { title: "PMI.Builder.Title", icon: "fa-solid fa-wand-sparkles", resizable: true },
    position: { width: 520, height: "auto" },
    actions: {
      newSeed: PmiBuilder.#onNewSeed,
    },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/builder.hbs` },
  };

  /** Draft recipe being edited. Lives only in this window until the DM creates an item. */
  recipe = { seed: newSeed(), rarity: "uncommon", baseUuid: null, picks: [] };

  static #instance = null;

  /** GM-only: players never see drafts. */
  static open() {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("PMI.Builder.GMOnly"));
      return null;
    }
    PmiBuilder.#instance ??= new PmiBuilder();
    PmiBuilder.#instance.render({ force: true });
    return PmiBuilder.#instance;
  }

  async _prepareContext() {
    return {
      recipe: this.recipe,
      rarities: RARITIES.map((key) => ({
        key,
        label: game.i18n.localize(CONFIG.DND5E?.itemRarity?.[key] ?? key),
        selected: key === this.recipe.rarity,
      })),
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("select[name=rarity]")?.addEventListener("change", (event) => {
      this.recipe.rarity = event.currentTarget.value;
      this.render();
    });
  }

  static #onNewSeed() {
    this.recipe.seed = newSeed();
    this.render();
  }
}
