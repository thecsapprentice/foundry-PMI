// Registries for change types (translators) and property definitions. Pure: no Foundry globals,
// so other modules, world scripts and the Node tests can all use the same code.
import { RARITIES, SLOTS } from "./config.mjs";

const changeTypes = new Map();
const properties = new Map();

/**
 * Register a translator for one change type.
 * @param {string} type                 e.g. "itemField", "activityDamage"
 * @param {(itemData: object, change: object, ctx: object) => void} translate
 *        Mutates the plain item data being compiled. Must not touch Foundry documents.
 */
export function registerChangeType(type, translate) {
  if (typeof type !== "string" || !/^[a-zA-Z][\w-]*$/.test(type)) throw new Error(`Invalid change type name: ${type}`);
  if (typeof translate !== "function") throw new Error(`Change type ${type} needs a translate function`);
  if (changeTypes.has(type)) throw new Error(`Change type ${type} is already registered`);
  changeTypes.set(type, translate);
}

export function getChangeType(type) {
  return changeTypes.get(type) ?? null;
}

/** Problems with one property definition, as strings. Empty when it's valid. */
export function validateProperty(def) {
  const errors = [];
  const id = def?.id ?? "(no id)";
  if (typeof def?.id !== "string" || !/^[a-z0-9][\w.-]*$/i.test(def.id)) errors.push(`${id}: id must be a simple string`);
  if (!SLOTS.includes(def?.slot)) errors.push(`${id}: slot must be one of ${SLOTS.join(", ")}`);
  if (!Number.isFinite(def?.cost) || def.cost < 0) errors.push(`${id}: cost must be a number ≥ 0`);
  if (def?.weight !== undefined && (!Number.isFinite(def.weight) || def.weight < 0)) errors.push(`${id}: weight must be a number ≥ 0`);
  if (def?.minRarity !== undefined && !RARITIES.includes(def.minRarity)) errors.push(`${id}: unknown minRarity ${def.minRarity}`);
  if (def?.maxRarity !== undefined && !RARITIES.includes(def.maxRarity)) errors.push(`${id}: unknown maxRarity ${def.maxRarity}`);
  if (!Array.isArray(def?.appliesTo) || !def.appliesTo.length) errors.push(`${id}: appliesTo must list item types`);
  if (!Array.isArray(def?.changes)) errors.push(`${id}: changes must be an array`);
  return errors;
}

/**
 * Register property definitions under a source label (a module id, "world", …).
 * Invalid or duplicate definitions are skipped and reported, never half-registered.
 * @returns {{added: string[], errors: string[]}}
 */
export function registerProperties(source, defs) {
  const added = [];
  const errors = [];
  for (const def of defs ?? []) {
    const problems = validateProperty(def);
    if (!problems.length && properties.has(def.id)) problems.push(`${def.id}: already registered by ${properties.get(def.id).source}`);
    if (problems.length) { errors.push(...problems); continue; }
    properties.set(def.id, Object.freeze({ ...structuredClone(def), source }));
    added.push(def.id);
  }
  return { added, errors };
}

export function getProperty(id) {
  return properties.get(id) ?? null;
}

export function listProperties(filter = () => true) {
  return [...properties.values()].filter(filter);
}

/** Test helper: forget everything registered. */
export function _resetRegistries() {
  changeTypes.clear();
  properties.clear();
}

export const api = Object.freeze({
  registerChangeType,
  getChangeType,
  registerProperties,
  validateProperty,
  getProperty,
  listProperties,
});
