// Registries for change types (translators) and property definitions. Pure: no Foundry globals,
// so other modules, world scripts and the Node tests can all use the same code.
import { RARITIES, SLOTS, CURSE_SLOT } from "./config.mjs";

const changeTypes = new Map();
const properties = new Map();
const bases = new Map();
let names = { themes: {}, forms: {}, tongues: {}, tongueWeights: {} };

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
  // Drawbacks (the curse slot) give budget back, so their cost is ≤ 0; every other property costs ≥ 0.
  if (def?.slot === CURSE_SLOT) {
    if (!Number.isFinite(def?.cost) || def.cost > 0) errors.push(`${id}: a drawback's cost must be a number ≤ 0`);
  } else if (!Number.isFinite(def?.cost) || def.cost < 0) errors.push(`${id}: cost must be a number ≥ 0`);
  if (def?.caps !== undefined && (typeof def.caps !== "object" || Object.values(def.caps).some((v) => !Number.isFinite(v)))) {
    errors.push(`${id}: caps must map limit names to numbers`);
  }
  if (def?.name !== undefined && !(typeof def.name === "string" || (Array.isArray(def.name) && def.name.length && def.name.every((n) => typeof n === "string")))) {
    errors.push(`${id}: name must be a string or a list of strings`);
  }
  if (def?.weight !== undefined && (!Number.isFinite(def.weight) || def.weight < 0)) errors.push(`${id}: weight must be a number ≥ 0`);
  if (def?.minRarity !== undefined && !RARITIES.includes(def.minRarity)) errors.push(`${id}: unknown minRarity ${def.minRarity}`);
  if (def?.maxRarity !== undefined && !RARITIES.includes(def.maxRarity)) errors.push(`${id}: unknown maxRarity ${def.maxRarity}`);
  if (!Array.isArray(def?.appliesTo) || !def.appliesTo.length) errors.push(`${id}: appliesTo must list item types`);
  if (def?.notFor !== undefined && !Array.isArray(def.notFor)) errors.push(`${id}: notFor must be a list of categories`);
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

/**
 * Register built-in base items (mundane items properties can be added to). Each is plain item source data
 * with an `id`: { id, name, type: "equipment" | "weapon", img, system }. Offered as "pmi-base:<id>".
 * @returns {{added: string[], errors: string[]}}
 */
export function registerBases(source, defs) {
  const added = [];
  const errors = [];
  for (const def of defs ?? []) {
    const id = def?.id ?? "(no id)";
    const problems = [];
    if (typeof def?.id !== "string" || !/^[a-z0-9][\w-]*$/i.test(def.id)) problems.push(`${id}: id must be a simple string`);
    if (typeof def?.name !== "string" || !def.name) problems.push(`${id}: needs a name`);
    if (!["equipment", "weapon"].includes(def?.type)) problems.push(`${id}: type must be equipment or weapon`);
    if (!def?.system || typeof def.system !== "object") problems.push(`${id}: needs system data`);
    if (!problems.length && bases.has(def.id)) problems.push(`${def.id}: already registered by ${bases.get(def.id).source}`);
    if (problems.length) { errors.push(...problems); continue; }
    bases.set(def.id, Object.freeze({ ...structuredClone(def), source }));
    added.push(def.id);
  }
  return { added, errors };
}

/** Item source data for a built-in base (a fresh copy), or null. */
export function getBase(id) {
  const def = bases.get(id);
  if (!def) return null;
  const { id: _id, source, ...data } = structuredClone(def);
  return { ...data, effects: [], flags: {} };
}

export function listBases() {
  return [...bases.values()].map((b) => ({ id: b.id, name: b.name, source: b.source }));
}

/**
 * Add naming vocabulary: { themes, forms, tongues, tongueWeights }. Later registrations add to or replace
 * entries by key, so a module can add a theme or a whole new tongue.
 */
export function registerNames(source, data) {
  const errors = [];
  for (const section of ["themes", "forms", "tongues", "tongueWeights"]) {
    const entries = data?.[section];
    if (entries === undefined) continue;
    if (!entries || typeof entries !== "object") { errors.push(`${section} must be an object`); continue; }
    for (const [key, value] of Object.entries(entries)) names[section][key] = structuredClone(value);
  }
  return { added: errors.length ? [] : [source], errors };
}

/** The naming vocabulary (a copy), or null if none is registered. */
export function getNames() {
  return Object.keys(names.themes).length && Object.keys(names.forms).length ? structuredClone(names) : null;
}

/** Test helper: forget everything registered. */
export function _resetRegistries() {
  changeTypes.clear();
  properties.clear();
  bases.clear();
  names = { themes: {}, forms: {}, tongues: {}, tongueWeights: {} };
}

export const api = Object.freeze({
  registerChangeType,
  getChangeType,
  registerProperties,
  validateProperty,
  getProperty,
  listProperties,
  registerBases,
  getBase,
  listBases,
  registerNames,
  getNames,
});
