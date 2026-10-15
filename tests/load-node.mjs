// Node-side equivalent of scripts/registry/load.mjs, for tests.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { _resetRegistries, registerChangeType, registerProperties, registerBases, listProperties, getProperty, getChangeType, getBase, listBases } from "../scripts/api.mjs";
import { BUILTIN_TRANSLATORS } from "../scripts/compiler/translators.mjs";
import { PROPERTY_FILES, BASE_FILES } from "../scripts/registry/files.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export function loadAll() {
  _resetRegistries();
  for (const [type, fn] of Object.entries(BUILTIN_TRANSLATORS)) registerChangeType(type, fn);
  const errors = [];
  for (const f of BASE_FILES) {
    const json = JSON.parse(fs.readFileSync(`${ROOT}data/bases/${f}`, "utf8"));
    errors.push(...registerBases("foundry-pmi", json.bases).errors);
  }
  for (const f of PROPERTY_FILES) {
    const json = JSON.parse(fs.readFileSync(`${ROOT}data/properties/${f}`, "utf8"));
    errors.push(...registerProperties("foundry-pmi", json.properties).errors);
  }
  return { properties: listProperties(), getDef: getProperty, getTranslator: getChangeType, getBase, listBases, errors };
}

export const fixture = (name) => JSON.parse(fs.readFileSync(`${ROOT}tests/fixtures/${name}.json`, "utf8"));

/** Spell summaries built from the SRD's spells and class spell lists (see tests/fixtures/spells.json). */
export const spellPool = () => fixture("spells");
