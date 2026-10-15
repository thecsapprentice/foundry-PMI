// The budget roller: chooses properties for a recipe. Pure.
//
// A recipe is plain JSON:
//   { version, seed, rarity, baseUuid, rerolls, picks: [{ id, seed, params, locked }] }
// Each pick keeps its own seed, so its parameters can be rerolled without touching other picks.
import { RARITIES, RARITY_RULES, SLOT_LIMITS, RECIPE_VERSION } from "../config.mjs";
import { Rng } from "./rng.mjs";
import { appliesTo } from "./categories.mjs";
import { resolveParams } from "./params.mjs";

const rank = (r) => RARITIES.indexOf(r);

/** A fresh recipe. */
export function newRecipe({ seed, rarity = "uncommon", baseUuid = null } = {}) {
  return { version: RECIPE_VERSION, seed, rarity, baseUuid, rerolls: 0, picks: [] };
}

/** Totals for a recipe's picks. `getDef` looks up a property by id. */
export function tally(recipe, getDef) {
  const rules = RARITY_RULES[recipe.rarity] ?? RARITY_RULES.uncommon;
  const defs = recipe.picks.map((p) => getDef(p.id));
  const spent = defs.reduce((sum, d) => sum + (d?.cost ?? 0), 0);
  return { budget: rules.budget, spent, remaining: rules.budget - spent, maxProperties: rules.maxProperties, count: recipe.picks.length };
}

/**
 * Why a property can't be added alongside the current picks, or null if it can.
 * Reasons are short codes the builder can translate.
 */
export function blockReason(def, recipe, categories, getDef, { ignoreIndex = -1, ignoreBudget = false } = {}) {
  if (!appliesTo(def, categories)) return "category";
  if (def.minRarity && rank(recipe.rarity) < rank(def.minRarity)) return "rarityLow";
  if (def.maxRarity && rank(recipe.rarity) > rank(def.maxRarity)) return "rarityHigh";
  const others = recipe.picks.filter((_, i) => i !== ignoreIndex);
  if (others.some((p) => p.id === def.id)) return "duplicate";
  const otherDefs = others.map((p) => getDef(p.id)).filter(Boolean);
  if (otherDefs.filter((d) => d.slot === def.slot).length >= (SLOT_LIMITS[def.slot] ?? 1)) return "slotFull";
  const groups = new Set(otherDefs.flatMap((d) => [].concat(d.exclusive ?? [])));
  if ([].concat(def.exclusive ?? []).some((g) => groups.has(g))) return "exclusive";
  const rules = RARITY_RULES[recipe.rarity] ?? RARITY_RULES.uncommon;
  if (others.length >= rules.maxProperties) return "maxProperties";
  if (!ignoreBudget) {
    const spent = otherDefs.reduce((s, d) => s + (d.cost ?? 0), 0);
    if (spent + def.cost > rules.budget) return "budget";
  }
  return null;
}

/** A pick for a property, with its parameters rolled from `seed`. */
export function makePick(def, rarity, seed) {
  return { id: def.id, seed, params: resolveParams(def, rarity, new Rng(seed)), locked: false };
}

/**
 * Fill a recipe: keeps locked picks, drops the rest, then adds properties by weight until the budget,
 * the property cap or the candidates run out. Returns a new recipe; the input is not changed.
 * @param {object} recipe
 * @param {object} opts
 * @param {object[]} opts.properties  All property definitions to choose from.
 * @param {string[]} opts.categories  The base item's categories.
 */
export function roll(recipe, { properties, categories }) {
  const getDef = byId(properties);
  const out = structuredClone(recipe);
  out.picks = out.picks.filter((p) => p.locked && getDef(p.id));
  const rng = new Rng(out.seed).fork(`roll:${out.rerolls ?? 0}`);
  for (let step = 0; step < 32; step++) {
    const candidates = properties.filter((d) => !blockReason(d, out, categories, getDef));
    const def = rng.fork(`step:${step}`).weighted(candidates, (d) => d.weight ?? 1);
    if (!def) break;
    out.picks.push(makePick(def, out.rarity, `${out.seed}/${out.rerolls ?? 0}/${step}/${def.id}`));
  }
  return out;
}

/**
 * Replace one pick with a different valid property. Returns a new recipe, or null if nothing else fits.
 * Uses (and advances) the recipe's reroll counter, so the result is reproducible from the recipe.
 */
export function rerollPick(recipe, index, { properties, categories }) {
  const getDef = byId(properties);
  const current = recipe.picks[index];
  if (!current) return null;
  const out = structuredClone(recipe);
  out.rerolls = (out.rerolls ?? 0) + 1;
  const rng = new Rng(out.seed).fork(`reroll:${out.rerolls}`);
  const candidates = properties.filter((d) => d.id !== current.id && !blockReason(d, out, categories, getDef, { ignoreIndex: index }));
  const def = rng.weighted(candidates, (d) => d.weight ?? 1);
  if (!def) return null;
  out.picks[index] = makePick(def, out.rarity, `${out.seed}/r${out.rerolls}/${def.id}`);
  return out;
}

/** Reroll only a pick's parameters (e.g. a different element). Returns a new recipe. */
export function rerollParams(recipe, index, { properties }) {
  const def = byId(properties)(recipe.picks[index]?.id);
  if (!def) return null;
  const out = structuredClone(recipe);
  out.rerolls = (out.rerolls ?? 0) + 1;
  const pick = out.picks[index];
  out.picks[index] = { ...makePick(def, out.rarity, `${out.seed}/p${out.rerolls}/${def.id}`), locked: pick.locked };
  return out;
}

/** Add a specific property chosen by the DM. Returns a new recipe. Budget is not enforced here; see tally(). */
export function addPick(recipe, def) {
  const out = structuredClone(recipe);
  out.rerolls = (out.rerolls ?? 0) + 1;
  out.picks.push(makePick(def, out.rarity, `${out.seed}/a${out.rerolls}/${def.id}`));
  return out;
}

export function removePick(recipe, index) {
  const out = structuredClone(recipe);
  out.picks.splice(index, 1);
  return out;
}

export function toggleLock(recipe, index) {
  const out = structuredClone(recipe);
  if (out.picks[index]) out.picks[index].locked = !out.picks[index].locked;
  return out;
}

/**
 * Picks that no longer fit after something changed (a new rarity or base item), with the reason for each.
 * The budget is reported by tally() instead, since the DM may overspend on purpose.
 */
export function invalidPicks(recipe, { properties, categories }) {
  const getDef = byId(properties);
  const out = [];
  recipe.picks.forEach((p, i) => {
    const def = getDef(p.id);
    if (!def) { out.push({ index: i, reason: "unknown" }); return; }
    const partial = { ...recipe, picks: recipe.picks.slice(0, i) };
    const reason = blockReason(def, partial, categories, getDef, { ignoreBudget: true });
    if (reason) out.push({ index: i, reason });
  });
  return out;
}

function byId(properties) {
  const map = new Map(properties.map((d) => [d.id, d]));
  return (id) => map.get(id) ?? null;
}
