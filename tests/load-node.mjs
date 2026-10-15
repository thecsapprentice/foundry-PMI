// Node-side equivalent of scripts/registry/load.mjs, for tests.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { _resetRegistries, registerChangeType, registerProperties, listProperties, getProperty, getChangeType } from "../scripts/api.mjs";
import { BUILTIN_TRANSLATORS } from "../scripts/compiler/translators.mjs";
import { PROPERTY_FILES } from "../scripts/registry/files.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export function loadAll() {
  _resetRegistries();
  for (const [type, fn] of Object.entries(BUILTIN_TRANSLATORS)) registerChangeType(type, fn);
  const errors = [];
  for (const f of PROPERTY_FILES) {
    const json = JSON.parse(fs.readFileSync(`${ROOT}data/properties/${f}`, "utf8"));
    errors.push(...registerProperties("foundry-pmi", json.properties).errors);
  }
  return { properties: listProperties(), getDef: getProperty, getTranslator: getChangeType, errors };
}

export const fixture = (name) => JSON.parse(fs.readFileSync(`${ROOT}tests/fixtures/${name}.json`, "utf8"));
