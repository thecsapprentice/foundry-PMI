// What kind of thing a base item is, as category strings properties can target. Pure.
import { ARMOR_TYPES, SHIELD_TYPES, WAND_TYPES, ROD_TYPES, BASE_KINDS, WORN_TYPES, IDENTIFIER_CATEGORIES } from "../config.mjs";

/**
 * Categories for a base item's source data, e.g.
 *   Longsword  → ["weapon", "weapon.melee", "weapon.martial", "weapon.longsword", "weapon.prop.ver"]
 *                (weapon properties appear as "weapon.prop.<key>": hvy, fin, thr, two, lgt, amm, …)
 *   Chain Mail → ["armor", "armor.heavy", "armor.chainmail"]
 *   Shield     → ["shield"]
 *   Staff      → ["staff", "weapon", "weapon.melee", …]   (a quarterstaff that is a spellcasting focus)
 *   Wand       → ["wand"]          Rod → ["rod"]
 *   Ring       → ["worn", "ring"]  Cloak → ["worn", "cloak"]  (worn items by dnd5e identifier, see IDENTIFIER_CATEGORIES)
 * Returns an empty array for anything the generator doesn't support yet.
 * @param {object} base  Item source data ({type, system}).
 * @returns {string[]}
 */
export function categorize(base) {
  const type = base?.system?.type?.value ?? "";
  const baseItem = base?.system?.type?.baseItem ?? "";
  const props = base?.system?.properties ?? [];
  const has = (p) => (Array.isArray(props) ? props.includes(p) : !!props.has?.(p));
  if (base?.type === "weapon") {
    const out = ["weapon"];
    if (baseItem === "quarterstaff" && has("foc")) out.unshift("staff");
    if (type.endsWith("M")) out.push("weapon.melee");
    if (type.endsWith("R")) out.push("weapon.ranged");
    if (type.startsWith("simple")) out.push("weapon.simple");
    if (type.startsWith("martial")) out.push("weapon.martial");
    if (baseItem) out.push(`weapon.${baseItem}`);
    for (const p of Array.isArray(props) ? props : [...(props ?? [])]) if (p !== "mgc" && p !== "foc") out.push(`weapon.prop.${p}`);
    return out;
  }
  if (base?.type === "equipment" && ARMOR_TYPES.includes(type)) {
    const out = ["armor", `armor.${type}`];
    if (baseItem) out.push(`armor.${baseItem}`);
    return out;
  }
  if (base?.type === "equipment" && SHIELD_TYPES.includes(type)) return ["shield"];
  // Identifier first: the 2024 Wand and Rod are "trinket" equipment, and worn items need their body slot.
  const identifier = base?.system?.identifier ?? "";
  if (base?.type === "equipment" && [...WORN_TYPES, ...WAND_TYPES, ...ROD_TYPES].includes(type) && IDENTIFIER_CATEGORIES[identifier]) {
    return [...IDENTIFIER_CATEGORIES[identifier]];
  }
  if (base?.type === "equipment" && WAND_TYPES.includes(type)) return ["wand"];
  if (base?.type === "equipment" && ROD_TYPES.includes(type)) return ["rod"];
  if (base?.type === "equipment" && type === "ring") return ["worn", "ring"];
  return [];
}

/** Does a property fit these categories: something in `appliesTo` matches, and nothing in `notFor` does? */
export function appliesTo(def, categories) {
  if ((def.notFor ?? []).some((c) => categories.includes(c))) return false;
  return (def.appliesTo ?? []).some((c) => categories.includes(c));
}

/** Is an item already magical? The builder offers only mundane bases. */
export function isMundane(base) {
  const props = base?.system?.properties ?? [];
  const has = Array.isArray(props) ? props.includes("mgc") : props.has?.("mgc");
  return !has && !(base?.system?.magicalBonus > 0) && !(base?.system?.armor?.magicalBonus > 0)
    && !["uncommon", "rare", "veryRare", "legendary", "artifact"].includes(base?.system?.rarity);
}

/** The single kind a base item counts as for the random buttons and charge pools ("staff" before "weapon"). */
export function kindOf(categories) {
  return BASE_KINDS.find((k) => categories.includes(k)) ?? null;
}
