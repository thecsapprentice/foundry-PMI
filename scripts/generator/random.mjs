// Random choices for the builder's quick buttons. Pure.
import { RARITY_WEIGHTS } from "../config.mjs";

/**
 * A random rarity, weighted by RARITY_WEIGHTS, never the same as `current` (so the button always changes something).
 * @param {import("./rng.mjs").Rng} rng
 */
export function randomRarity(rng, current = null) {
  const entries = Object.entries(RARITY_WEIGHTS).filter(([r]) => r !== current).map(([r, weight]) => ({ r, weight }));
  return rng.weighted(entries)?.r ?? current;
}

/**
 * A random base item entry of a kind ("any", "weapon", "armor" or "shield"), avoiding `currentUuid` when there's a choice.
 * @param {{uuid: string, kind: string}[]} entries
 * @returns {object|null}  null when nothing of that kind is available.
 */
export function randomBase(entries, kind, rng, currentUuid = null) {
  const pool = entries.filter((e) => kind === "any" || e.kind === kind);
  if (!pool.length) return null;
  const others = pool.filter((e) => e.uuid !== currentUuid);
  return rng.pick(others.length ? others : pool);
}
