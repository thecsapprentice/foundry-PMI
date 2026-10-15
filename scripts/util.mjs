// Foundry-facing helpers shared by the builder and hooks.
import { MODULE_ID } from "./config.mjs";
import { chosenBasePackIds } from "./settings.mjs";

/** CLAUDE.md rule 2: an item is PMI's only if it carries PMI's recipe. Never decided by name. */
export function isPmiItem(item) {
  const recipe = item?.flags?.[MODULE_ID]?.recipe ?? item?.getFlag?.(MODULE_ID, "recipe");
  return !!recipe && typeof recipe === "object" && Array.isArray(recipe.picks);
}

/** A copy of a PMI item's recipe (never the live flag object; rule 9). */
export function recipeOf(item) {
  if (!isPmiItem(item)) return null;
  return foundry.utils.deepClone(item.flags[MODULE_ID].recipe);
}

/** PMI's folder for generated items, found by flag, never by name. */
export function findPmiFolder() {
  return game.folders.find((f) => f.type === "Item" && f.getFlag(MODULE_ID, "generated") === true) ?? null;
}

/** Find or create PMI's folder. GM only. */
export async function ensurePmiFolder() {
  if (!game.user.isGM) throw new Error("Only a GM can create PMI's folder");
  return findPmiFolder() ?? Folder.implementation.create({
    name: game.i18n.localize("PMI.Folder.Name"),
    type: "Item",
    color: "#4b2a6b",
    flags: { [MODULE_ID]: { generated: true } },
  });
}

/** Compendiums offered as sources of base items: the GM's choice in the module settings. */
export function basePacks() {
  return chosenBasePackIds().map((id) => game.packs.get(id)).filter((p) => p?.documentName === "Item");
}
