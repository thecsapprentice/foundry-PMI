// What kind of thing a base item is, as category strings properties can target. Pure.
import { ARMOR_TYPES, SHIELD_TYPES } from "../config.mjs";

/**
 * Categories for a base item's source data, e.g.
 *   Longsword  → ["weapon", "weapon.melee", "weapon.martial", "weapon.longsword"]
 *   Chain Mail → ["armor", "armor.heavy", "armor.chainmail"]
 *   Shield     → ["shield"]
 * Returns an empty array for anything the generator doesn't support yet.
 * @param {object} base  Item source data ({type, system}).
 * @returns {string[]}
 */
export function categorize(base) {
  const type = base?.system?.type?.value ?? "";
  const baseItem = base?.system?.type?.baseItem ?? "";
  if (base?.type === "weapon") {
    const out = ["weapon"];
    if (type.endsWith("M")) out.push("weapon.melee");
    if (type.endsWith("R")) out.push("weapon.ranged");
    if (type.startsWith("simple")) out.push("weapon.simple");
    if (type.startsWith("martial")) out.push("weapon.martial");
    if (baseItem) out.push(`weapon.${baseItem}`);
    return out;
  }
  if (base?.type === "equipment" && ARMOR_TYPES.includes(type)) {
    const out = ["armor", `armor.${type}`];
    if (baseItem) out.push(`armor.${baseItem}`);
    return out;
  }
  if (base?.type === "equipment" && SHIELD_TYPES.includes(type)) return ["shield"];
  return [];
}

/** Does a property's `appliesTo` list match any of these categories? */
export function appliesTo(def, categories) {
  return (def.appliesTo ?? []).some((c) => categories.includes(c));
}

/** Is an item already magical? The builder offers only mundane bases. */
export function isMundane(base) {
  const props = base?.system?.properties ?? [];
  const has = Array.isArray(props) ? props.includes("mgc") : props.has?.("mgc");
  return !has && !(base?.system?.magicalBonus > 0) && !(base?.system?.armor?.magicalBonus > 0)
    && !["uncommon", "rare", "veryRare", "legendary", "artifact"].includes(base?.system?.rarity);
}
