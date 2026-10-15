// Loads PMI's built-in property files and change types into the registries.
// The only fetch in PMI: read-only, and only PMI's own files under modules/foundry-pmi/data/ (CLAUDE.md rule 8).
import { MODULE_ID } from "../config.mjs";
import { registerChangeType, registerProperties } from "../api.mjs";
import { BUILTIN_TRANSLATORS } from "../compiler/translators.mjs";
import { PROPERTY_FILES } from "./files.mjs";

export function registerBuiltinChangeTypes() {
  for (const [type, fn] of Object.entries(BUILTIN_TRANSLATORS)) registerChangeType(type, fn);
}

/** @returns {Promise<{added: number, errors: string[]}>} */
export async function loadBuiltinProperties() {
  let added = 0;
  const errors = [];
  for (const file of PROPERTY_FILES) {
    const path = `modules/${MODULE_ID}/data/properties/${file}`;
    try {
      const res = await fetch(path, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const r = registerProperties(MODULE_ID, json.properties ?? []);
      added += r.added.length;
      errors.push(...r.errors.map((e) => `${file}: ${e}`));
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
    }
  }
  return { added, errors };
}
