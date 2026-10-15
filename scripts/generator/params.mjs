// Property parameters: rolling them, and substituting them into changes, names and text. Pure.
import { RARITIES } from "../config.mjs";

/**
 * Resolve one parameter spec for a rarity.
 *   { pick: [a, b, …] }               one entry, uniformly (entries may be values or objects with `value`)
 *   { pick: [...], weights: [...] }   one entry, weighted
 *   { byRarity: { rare: x, … } }      the value for this rarity, or the nearest lower rarity that has one
 *   { range: [min, max] }             an integer in that range
 *   { value: x }                      a constant
 * @param {object} spec
 * @param {string} rarity
 * @param {import("./rng.mjs").Rng} rng
 */
export function resolveParam(spec, rarity, rng) {
  if (spec == null || typeof spec !== "object") throw new Error(`Bad parameter spec: ${JSON.stringify(spec)}`);
  if ("value" in spec) return spec.value;
  if (Array.isArray(spec.pick)) {
    if (Array.isArray(spec.weights)) {
      const entries = spec.pick.map((v, i) => ({ v, weight: spec.weights[i] ?? 0 }));
      const hit = rng.weighted(entries);
      if (!hit) throw new Error("Parameter weights are all zero");
      return hit.v;
    }
    return rng.pick(spec.pick);
  }
  if (spec.byRarity && typeof spec.byRarity === "object") {
    const idx = RARITIES.indexOf(rarity);
    for (let i = idx; i >= 0; i--) if (RARITIES[i] in spec.byRarity) return spec.byRarity[RARITIES[i]];
    // Nothing at or below this rarity: use the lowest one defined.
    const first = RARITIES.find((r) => r in spec.byRarity);
    if (first) return spec.byRarity[first];
    throw new Error("byRarity has no recognised rarities");
  }
  if (Array.isArray(spec.range) && spec.range.length === 2) return rng.int(spec.range[0], spec.range[1]);
  throw new Error(`Unknown parameter spec: ${JSON.stringify(spec)}`);
}

/** Resolve every parameter of a property, each from its own forked stream. */
export function resolveParams(def, rarity, rng) {
  const out = {};
  for (const [name, spec] of Object.entries(def.params ?? {})) out[name] = resolveParam(spec, rarity, rng.fork(`param:${name}`));
  return out;
}

/** The plain value of a resolved parameter: objects with a `value` key stand for that value. */
export function plain(v) {
  return v && typeof v === "object" && !Array.isArray(v) && "value" in v ? v.value : v;
}

const WHOLE = /^@([A-Za-z_][\w]*)$/;
const INLINE = /@([A-Za-z_][\w]*)/g;
const TEMPLATE = /\{([A-Za-z_][\w]*)(?:\.([A-Za-z_][\w]*))?\}/g;

/**
 * Deep-copy `value`, substituting variables:
 *   "@name" alone      → the variable's plain value, keeping its type (number, array, …)
 *   "… @name …"        → the plain value spliced into the string
 *   "{name}"/"{name.k}" → the plain value, or field `k` of an object parameter
 * Unknown variables are left as written and reported through `missing`.
 */
export function substitute(value, vars, missing = new Set()) {
  if (typeof value === "string") {
    const whole = value.match(WHOLE);
    if (whole) {
      if (whole[1] in vars) return structuredClone(plain(vars[whole[1]]));
      missing.add(whole[1]);
      return value;
    }
    return value
      .replace(TEMPLATE, (m, name, key) => {
        if (!(name in vars)) { missing.add(key ? `${name}.${key}` : name); return m; }
        const v = vars[name];
        if (key) {
          if (v && typeof v === "object" && key in v) return String(v[key]);
          missing.add(`${name}.${key}`);
          return m;
        }
        return String(plain(v));
      })
      .replace(INLINE, (m, name) => {
        if (!(name in vars)) { missing.add(name); return m; }
        return String(plain(vars[name]));
      });
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, vars, missing));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, vars, missing)]));
  }
  return value;
}
