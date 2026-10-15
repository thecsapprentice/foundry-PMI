// Procedural Magic Items: entry point. Hooks, the builder button and the public API.
import { MODULE_ID } from "./config.mjs";
import { api } from "./api.mjs";
import { PmiBuilder } from "./apps/builder.mjs";

Hooks.once("init", () => {
  const module = game.modules.get(MODULE_ID);
  module.api = Object.freeze({ ...api, openBuilder: () => PmiBuilder.open() });
});

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") {
    ui.notifications.error(game.i18n.localize("PMI.Errors.WrongSystem"));
    return;
  }
  if (!game.modules.get("lib-wrapper")?.active && game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("PMI.Errors.NoLibWrapper"));
  }
  Hooks.callAll(`${MODULE_ID}.ready`, game.modules.get(MODULE_ID).api);
});

// A GM-only "Magic Item Builder" button at the top of the Items sidebar.
Hooks.on("renderItemDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html[0];
  const actions = root?.querySelector(".header-actions");
  if (!actions || actions.querySelector(".pmi-open-builder")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pmi-open-builder";
  button.innerHTML = `<i class="fa-solid fa-wand-sparkles"></i> ${game.i18n.localize("PMI.Builder.Open")}`;
  button.addEventListener("click", () => PmiBuilder.open());
  actions.append(button);
});
