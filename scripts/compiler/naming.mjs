// Item names from property name fragments. Pure.
//   prefixes + base + suffix + enhancement → "Keen Flaming Longsword of the Owl +1"
// Spell properties name the item ("Wand of Fireball") only when there's no suffix, and only the first one does.

/**
 * @param {string} baseName
 * @param {{ def: { slot: string }, nameFragment: string }[]} resolved  Picks in slot order.
 */
export function buildName(baseName, resolved) {
  // Prefixes follow English adjective order: qualities ("Keen") before actions ("Winged") before elements ("Flaming").
  // A property's `nameOrder` (default 1) sets its place; ties keep slot/roll order.
  const frag = (slot) => resolved
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.def.slot === slot)
    .sort((a, b) => (a.r.def.nameOrder ?? 1) - (b.r.def.nameOrder ?? 1) || a.i - b.i)
    .map(({ r }) => r.nameFragment)
    .filter(Boolean);
  const suffix = frag("suffix");
  const ending = suffix.length ? suffix : frag("spell").slice(0, 1);
  const parts = [...frag("prefix"), baseName, ...ending];
  const enhancement = frag("enhancement");
  return [parts.join(" "), ...enhancement].join(" ").replace(/\s+/g, " ").trim();
}
