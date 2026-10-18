// The budget roller: chooses properties for a recipe. Pure.
//
// A recipe is plain JSON:
//   { version, seed, rarity, baseUuid, rerolls, picks: [{ id, seed, params, locked }] }
// Each pick keeps its own seed, so its parameters can be rerolled without touching other picks.
import { RARITIES, RARITY_RULES, SLOT_LIMITS, RECIPE_VERSION, CURSE_SLOT } from "../config.mjs";
import { Rng } from "./rng.mjs";
import { appliesTo } from "./categories.mjs";
import { resolveParams, spellSpecs, spellCandidates } from "./params.mjs";

const rank = (r) => RARITIES.indexOf(r);

/**
 * A property's random weight for this base: `weight` (default 1), multiplied by any `weightBy` entry
 * whose category the base has, e.g. { "weightBy": { "feet": 3 } } makes it three times as likely on boots.
 */
export function weightFor(def, categories) {
  let w = def.weight ?? 1;
  for (const [cat, mult] of Object.entries(def.weightBy ?? {})) if (categories.includes(cat)) w *= Number(mult) || 0;
  return w;
}

/** A fresh recipe. */
export function newRecipe({ seed, rarity = "uncommon", baseUuid = null } = {}) {
  return { version: RECIPE_VERSION, seed, rarity, baseUuid, rerolls: 0, picks: [], naming: { mode: "auto", custom: "", rerolls: 0 }, identified: true };
}

const isCurse = (d) => d?.slot === CURSE_SLOT;

/**
 * Totals for a recipe's picks. `getDef` looks up a property by id.
 * Drawbacks give budget back (`refund`) and don't count towards the property cap (`count` leaves them out).
 */
export function tally(recipe, getDef) {
  const rules = RARITY_RULES[recipe.rarity] ?? RARITY_RULES.uncommon;
  const defs = recipe.picks.map((p) => getDef(p.id));
  const blessings = defs.filter((d) => !isCurse(d));
  const curses = defs.filter(isCurse);
  const refund = -curses.reduce((sum, d) => sum + (d.cost ?? 0), 0);
  const budget = rules.budget + refund;
  const spent = blessings.reduce((sum, d) => sum + (d?.cost ?? 0), 0);
  return {
    budget, baseBudget: rules.budget, refund, spent, remaining: budget - spent,
    maxProperties: rules.maxProperties, count: blessings.length, curses: curses.length,
  };
}

/**
 * One-way clashes. A property's `tags` (and `exclusive` groups) say what it does ("rollMode", "darkvision");
 * another property's `conflicts` lists tags it can't share an item with. Unlike `exclusive`, two properties
 * with the same tag can still go together: Neutral (which cancels advantage) conflicts with every property
 * tagged "rollMode", but two "rollMode" properties don't conflict with each other.
 */
export function conflicts(def, otherDefs) {
  const groupsOf = (d) => [...[].concat(d.exclusive ?? []), ...[].concat(d.tags ?? [])];
  const mine = groupsOf(def);
  const against = [].concat(def.conflicts ?? []);
  return otherDefs.some((o) => groupsOf(o).some((g) => against.includes(g)) || [].concat(o.conflicts ?? []).some((g) => mine.includes(g)));
}

/** Is a property over the GM's power limits? A property's `caps` say how strong it is on each scale. */
export function overLimits(def, limits) {
  return Object.entries(def.caps ?? {}).some(([k, v]) => Number.isFinite(Number(limits?.[k])) && v > Number(limits[k]));
}

/**
 * Why a property can't be added alongside the current picks, or null if it can.
 * Reasons are short codes the builder can translate.
 */
/** UUIDs of spells already rolled onto a recipe's picks (optionally skipping one pick). */
export function usedSpells(recipe, ignoreIndex = -1) {
  const out = new Set();
  recipe.picks.forEach((p, i) => {
    if (i === ignoreIndex) return;
    for (const v of Object.values(p.params ?? {})) if (v && typeof v === "object" && v.uuid) out.add(v.uuid);
  });
  return out;
}

/**
 * Does a property's requirement hold, given the other properties on the item?
 *   requiresSlot: "spell"     another property in that slot
 *   requiresCharges: true     another property that gives the item charges (providesCharges)
 */
export function requirementsMet(def, otherDefs) {
  if (def.requiresSlot && !otherDefs.some((d) => d.slot === def.requiresSlot)) return false;
  if (def.requiresCharges && !otherDefs.some((d) => d.providesCharges)) return false;
  return true;
}

export function blockReason(def, recipe, categories, getDef, { ignoreIndex = -1, ignoreBudget = false, spells, limits } = {}) {
  if (!appliesTo(def, categories)) return "category";
  if (overLimits(def, limits)) return "powerCap";
  if (def.minRarity && rank(recipe.rarity) < rank(def.minRarity)) return "rarityLow";
  if (def.maxRarity && rank(recipe.rarity) > rank(def.maxRarity)) return "rarityHigh";
  const others = recipe.picks.filter((_, i) => i !== ignoreIndex);
  if (!def.repeatable && others.some((p) => p.id === def.id)) return "duplicate";
  const otherDefs = others.map((p) => getDef(p.id)).filter(Boolean);
  if (otherDefs.filter((d) => d.slot === def.slot).length >= (SLOT_LIMITS[def.slot] ?? 1)) return "slotFull";
  const groups = new Set(otherDefs.flatMap((d) => [].concat(d.exclusive ?? [])));
  if ([].concat(def.exclusive ?? []).some((g) => groups.has(g))) return "exclusive";
  if (conflicts(def, otherDefs)) return "exclusive";
  if (!requirementsMet(def, otherDefs)) return "requires";
  const rules = RARITY_RULES[recipe.rarity] ?? RARITY_RULES.uncommon;
  // Drawbacks are limited only by their slot; they never take a property place or cost budget.
  if (!isCurse(def) && otherDefs.filter((d) => !isCurse(d)).length >= rules.maxProperties) return "maxProperties";
  if (!ignoreBudget) {
    // Budget is net: drawbacks' negative costs give it back.
    const spent = otherDefs.reduce((s, d) => s + (d.cost ?? 0), 0);
    if (spent + def.cost > rules.budget) return "budget";
  }
  // Spell properties need at least one matching spell that isn't already on the item.
  // With no spell pool given, spell properties are simply unavailable.
  const specs = spellSpecs(def);
  if (specs.length) {
    const used = usedSpells(recipe, ignoreIndex);
    if (specs.some((spec) => !spellCandidates(spec, recipe.rarity, spells ?? [], used).length)) return "noSpells";
  }
  return null;
}

/** A pick for a property, with its parameters rolled from `seed`. ctx: { spells, excludeSpells, limits }. */
export function makePick(def, rarity, seed, ctx = {}) {
  return { id: def.id, seed, params: resolveParams(def, rarity, new Rng(seed), ctx), locked: false };
}

/**
 * Fill a recipe: keeps locked picks, drops the rest, then adds properties by weight until the budget,
 * the property cap or the candidates run out. Returns a new recipe; the input is not changed.
 * @param {object} recipe
 * @param {object} opts
 * @param {object[]} opts.properties  All property definitions to choose from.
 * @param {string[]} opts.categories  The base item's categories.
 */
export function roll(recipe, { properties, categories, spells, limits, curseChance = 0 }) {
  const getDef = byId(properties);
  const out = structuredClone(recipe);
  out.picks = out.picks.filter((p) => p.locked && getDef(p.id));
  const rng = new Rng(out.seed).fork(`roll:${out.rerolls ?? 0}`);
  // Drawbacks first, by chance only (and not when the DM locked one in): its refund then buys more blessings.
  if (!out.picks.some((p) => isCurse(getDef(p.id))) && rng.fork("curse?").next() < curseChance) {
    const candidates = properties.filter((d) => isCurse(d) && !blockReason(d, out, categories, getDef, { spells, limits }));
    const def = rng.fork("curse").weighted(candidates, (d) => weightFor(d, categories));
    if (def) out.picks.push(makePick(def, out.rarity, `${out.seed}/${out.rerolls ?? 0}/curse/${def.id}`, { spells, limits, excludeSpells: usedSpells(out) }));
  }
  for (let step = 0; step < 32; step++) {
    const candidates = properties.filter((d) => !isCurse(d) && !blockReason(d, out, categories, getDef, { spells, limits }));
    const def = rng.fork(`step:${step}`).weighted(candidates, (d) => weightFor(d, categories));
    if (!def) break;
    out.picks.push(makePick(def, out.rarity, `${out.seed}/${out.rerolls ?? 0}/${step}/${def.id}`, { spells, limits, excludeSpells: usedSpells(out) }));
  }
  return out;
}

/**
 * Add a random drawback the item doesn't have yet (budget aside: drawbacks only give it back).
 * Returns a new recipe, or null if no drawback fits.
 */
export function addRandomCurse(recipe, { properties, categories, spells, limits }) {
  const getDef = byId(properties);
  const out = structuredClone(recipe);
  out.rerolls = (out.rerolls ?? 0) + 1;
  const candidates = properties.filter((d) => isCurse(d) && !blockReason(d, out, categories, getDef, { spells, limits }));
  const def = new Rng(out.seed).fork(`curse:${out.rerolls}`).weighted(candidates, (d) => weightFor(d, categories));
  if (!def) return null;
  out.picks.push(makePick(def, out.rarity, `${out.seed}/c${out.rerolls}/${def.id}`, { spells, limits, excludeSpells: usedSpells(out) }));
  return out;
}

/**
 * Replace one pick with a different valid property. Returns a new recipe, or null if nothing else fits.
 * Uses (and advances) the recipe's reroll counter, so the result is reproducible from the recipe.
 */
export function rerollPick(recipe, index, { properties, categories, spells, limits }) {
  const getDef = byId(properties);
  const current = recipe.picks[index];
  if (!current) return null;
  const out = structuredClone(recipe);
  out.rerolls = (out.rerolls ?? 0) + 1;
  const rng = new Rng(out.seed).fork(`reroll:${out.rerolls}`);
  // A drawback is rerolled into another drawback, a blessing into another blessing.
  const curse = isCurse(getDef(current.id));
  const candidates = properties.filter((d) => d.id !== current.id && isCurse(d) === curse
    && !blockReason(d, out, categories, getDef, { ignoreIndex: index, spells, limits }));
  const def = rng.weighted(candidates, (d) => weightFor(d, categories));
  if (!def) return null;
  out.picks[index] = makePick(def, out.rarity, `${out.seed}/r${out.rerolls}/${def.id}`, { spells, limits, excludeSpells: usedSpells(out, index) });
  return out;
}

/** Reroll only a pick's parameters (e.g. a different element). Returns a new recipe. */
export function rerollParams(recipe, index, { properties, spells, limits }) {
  const def = byId(properties)(recipe.picks[index]?.id);
  if (!def) return null;
  const out = structuredClone(recipe);
  out.rerolls = (out.rerolls ?? 0) + 1;
  const pick = out.picks[index];
  try {
    out.picks[index] = { ...makePick(def, out.rarity, `${out.seed}/p${out.rerolls}/${def.id}`, { spells, limits, excludeSpells: usedSpells(out, index) }), locked: pick.locked };
  } catch {
    return null; // e.g. no other spell fits
  }
  return out;
}

/**
 * Add a specific property chosen by the DM. Returns a new recipe. Budget is not enforced here; see tally().
 * Throws if its parameters can't be rolled (for example, no matching spell).
 */
export function addPick(recipe, def, { spells, limits } = {}) {
  const out = structuredClone(recipe);
  out.rerolls = (out.rerolls ?? 0) + 1;
  out.picks.push(makePick(def, out.rarity, `${out.seed}/a${out.rerolls}/${def.id}`, { spells, limits, excludeSpells: usedSpells(out) }));
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
export function invalidPicks(recipe, { properties, categories, limits }) {
  // Spell availability isn't rechecked here: a pick keeps the spell it already rolled.
  const getDef = byId(properties);
  const out = [];
  recipe.picks.forEach((p, i) => {
    const def = getDef(p.id);
    if (!def) { out.push({ index: i, reason: "unknown" }); return; }
    const partial = { ...recipe, picks: recipe.picks.slice(0, i) };
    let reason = blockReason(def, partial, categories, getDef, { ignoreBudget: true, spells: null, limits });
    // Picks are checked in the order they were added, but a requirement may be met by a later pick.
    if (reason === "requires" && requirementsMet(def, recipe.picks.filter((_, j) => j !== i).map((q) => getDef(q.id)).filter(Boolean))) reason = null;
    if (reason === "noSpells") reason = null; // a pick keeps the spell it already rolled
    if (reason) out.push({ index: i, reason });
  });
  return out;
}

function byId(properties) {
  const map = new Map(properties.map((d) => [d.id, d]));
  return (id) => map.get(id) ?? null;
}
