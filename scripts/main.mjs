// Procedural Magic Items: entry point. Hooks, the builder button and the public API.
import { MODULE_ID } from "./config.mjs";
import { api } from "./api.mjs";
import { PmiBuilder } from "./apps/builder.mjs";
import { registerBuiltinChangeTypes, loadBuiltinProperties } from "./registry/load.mjs";
import { isPmiItem } from "./util.mjs";
import { registerSettings } from "./settings.mjs";
import { registerTriggers } from "./runtime/triggers.mjs";

// Each start-up step runs on its own: one failing must never stop the others.
function step(label, fn) {
  try {
    return fn();
  } catch (err) {
    console.error(`${MODULE_ID} | Start-up step failed: ${label}`, err);
    return undefined;
  }
}

Hooks.once("init", () => {
  step("settings", () => registerSettings({
    onBasePacksChange: () => PmiBuilder.invalidateBases(),
    onSpellPacksChange: () => PmiBuilder.invalidateSpells(),
    openBuilder: () => PmiBuilder.open(),
  }));
  step("change types", () => registerBuiltinChangeTypes());
  step("api", () => {
    game.modules.get(MODULE_ID).api = Object.freeze({ ...api, isPmiItem, openBuilder: (item) => PmiBuilder.open(item) });
  });
});

Hooks.once("ready", async () => {
  if (game.system.id !== "dnd5e") {
    ui.notifications.error(game.i18n.localize("PMI.Errors.WrongSystem"));
    return;
  }
  if (!game.modules.get("lib-wrapper")?.active && game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("PMI.Errors.NoLibWrapper"));
  }
  // A browser can keep an old cached stylesheet after an update while the scripts are new.
  if (game.user.isGM) {
    const cssVersion = getComputedStyle(document.documentElement).getPropertyValue("--pmi-css-version").trim().replace(/"/g, "");
    const version = game.modules.get(MODULE_ID).version;
    if (cssVersion !== version) {
      console.warn(`${MODULE_ID} | Stylesheet version "${cssVersion || "none"}" doesn't match module version ${version}`);
      ui.notifications.warn(game.i18n.localize("PMI.Errors.StaleStyles"), { permanent: true });
    }
  }
  try {
    registerTriggers();
  } catch (err) {
    console.error(`${MODULE_ID} | Couldn't start automatic triggers; items still work, triggers won't fire automatically`, err);
  }
  const { added, errors } = await loadBuiltinProperties();
  if (errors.length) {
    console.warn(`${MODULE_ID} | Property problems:\n${errors.join("\n")}`);
    if (game.user.isGM) ui.notifications.warn(game.i18n.localize("PMI.Errors.PropertyLoad"));
  }
  console.log(`${MODULE_ID} | Loaded ${added} properties`);
  // Other modules and world scripts can register their own properties and change types here.
  Hooks.callAll(`${MODULE_ID}.ready`, game.modules.get(MODULE_ID).api);
});

// A GM-only "Magic Item Builder" button at the top of the Items sidebar. Other modules sometimes reshape
// the sidebar header, so try the known layouts in turn; the module settings have a button too.
const HEADER_SPOTS = [".header-actions", ".directory-header .action-buttons", ".directory-header"];
let noSpotNoted = false;
Hooks.on("renderItemDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".pmi-open-builder")) return;
  const spot = HEADER_SPOTS.map((sel) => root.querySelector(sel)).find(Boolean);
  if (!spot) {
    if (!noSpotNoted) console.warn(`${MODULE_ID} | Couldn't find the Items sidebar header for the builder button. Use Configure Settings → Procedural Magic Items → Open Magic Item Builder.`);
    noSpotNoted = true;
    return;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pmi-open-builder";
  button.innerHTML = `<i class="fa-solid fa-wand-sparkles"></i> ${game.i18n.localize("PMI.Builder.Open")}`;
  button.addEventListener("click", () => PmiBuilder.open());
  spot.append(button);
});

// GM-only context menu entry on PMI items: open a copy of the recipe in the builder.
Hooks.on("getItemDirectoryEntryContext", (html, options) => {
  const itemOf = (li) => game.items.get(li?.dataset?.documentId ?? li?.[0]?.dataset?.documentId ?? li?.data?.("documentId"));
  options.push({
    name: "PMI.Builder.OpenFromItem",
    icon: '<i class="fa-solid fa-wand-sparkles"></i>',
    condition: (li) => game.user.isGM && isPmiItem(itemOf(li)),
    callback: (li) => PmiBuilder.open(itemOf(li)),
  });
});
