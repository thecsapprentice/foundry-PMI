// Item names from property name fragments. Pure.
//   prefixes + base + suffix + enhancement → "Keen Flaming Longsword of the Owl +1"

/**
 * @param {string} baseName
 * @param {{ def: { slot: string }, nameFragment: string }[]} resolved  Picks in slot order.
 */
export function buildName(baseName, resolved) {
  const frag = (slot) => resolved.filter((r) => r.def.slot === slot).map((r) => r.nameFragment).filter(Boolean);
  const parts = [...frag("prefix"), baseName, ...frag("suffix")];
  const enhancement = frag("enhancement");
  return [parts.join(" "), ...enhancement].join(" ").replace(/\s+/g, " ").trim();
}
