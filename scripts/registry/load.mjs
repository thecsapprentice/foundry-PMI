// Loads PMI's built-in property files and change types into the registries.
// The only fetch in PMI: read-only, and only PMI's own files under modules/foundry-pmi/data/ (CLAUDE.md rule 8).
import { MODULE_ID } from "../config.mjs";
import { registerChangeType, registerProperties, registerBases } from "../api.mjs";
import { BUILTIN_TRANSLATORS } from "../compiler/translators.mjs";
import { PROPERTY_FILES, BASE_FILES } from "./files.mjs";

export function registerBuiltinChangeTypes() {
  for (const [type, fn] of Object.entries(BUILTIN_TRANSLATORS)) registerChangeType(type, fn);
}

/** Read one of PMI's own data files. The only fetch in PMI (CLAUDE.md rule 8). */
async function readModuleJson(path) {
  const res = await fetch(`modules/${MODULE_ID}/data/${path}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Load the built-in base items and property definitions. @returns {Promise<{added: number, errors: string[]}>} */
export async function loadBuiltinProperties() {
  let added = 0;
  const errors = [];
  const load = async (dir, file, key, register) => {
    try {
      const json = await readModuleJson(`${dir}/${file}`);
      const r = register(MODULE_ID, json[key] ?? []);
      added += r.added.length;
      errors.push(...r.errors.map((e) => `${file}: ${e}`));
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
    }
  };
  for (const file of BASE_FILES) await load("bases", file, "bases", registerBases);
  for (const file of PROPERTY_FILES) await load("properties", file, "properties", registerProperties);
  return { added, errors };
}
