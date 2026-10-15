// dnd5e DamageField data from a formula. Pure.

const SIMPLE = /^\s*(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i;

/**
 * "1d6" → { number: 1, denomination: 6, bonus: "", types: ["fire"], … }
 * "2d6+3" keeps the 3 as a bonus. Anything else ("1d4 + @prof") becomes a custom formula.
 * @param {string|number} formula
 * @param {string[]} types
 */
export function damagePart(formula, types = []) {
  const f = String(formula ?? "").trim();
  const base = {
    number: null, denomination: 0, bonus: "", types: [...types],
    custom: { enabled: false, formula: "" },
    scaling: { mode: "", number: null, formula: "" },
  };
  const m = f.match(SIMPLE);
  if (m) {
    base.number = Number(m[1]);
    base.denomination = Number(m[2]);
    if (m[3]) base.bonus = m[3] === "-" ? `-${m[4]}` : m[4];
    return base;
  }
  if (/^\d+$/.test(f)) { base.bonus = f; return base; }
  base.custom = { enabled: true, formula: f };
  return base;
}
