// Project rules that are easy to check mechanically.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check } from "./check.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

// The pure core must not touch Foundry globals.
const FOUNDRY = /\b(game|ui|canvas|Hooks|CONFIG|foundry|libWrapper|fromUuid|ChatMessage|Item|Actor)\s*[.(]/;
for (const sub of ["generator", "compiler"]) {
  const d = path.join(ROOT, "scripts", sub);
  if (!fs.existsSync(d)) continue;
  for (const f of walk(d).filter((f) => f.endsWith(".mjs"))) {
    const bad = fs.readFileSync(f, "utf8").split("\n").map((l, i) => [i + 1, l])
      .filter(([, l]) => !l.trim().startsWith("//") && FOUNDRY.test(l));
    check(`${path.relative(ROOT, f)} has no Foundry globals`, bad.length === 0, bad.map(([n, l]) => `${n}: ${l.trim()}`).join(" | "));
  }
}

// module.json, if built, points only at files that exist and declares the agreed dependencies.
const mpath = path.join(ROOT, "module.json");
if (fs.existsSync(mpath)) {
  const m = JSON.parse(fs.readFileSync(mpath, "utf8"));
  check("module id is foundry-pmi", m.id === "foundry-pmi");
  for (const rel of [...m.esmodules, ...m.styles, ...m.languages.map((l) => l.path)])
    check(`module.json file exists: ${rel}`, fs.existsSync(path.join(ROOT, rel)));
  check("targets Foundry v12", m.compatibility.minimum === "12" && m.compatibility.maximum === "12");
  check("targets dnd5e 4.4", m.relationships.systems[0].id === "dnd5e" && m.relationships.systems[0].compatibility.minimum === "4.4.0");
  check("only requires libWrapper", m.relationships.requires.length === 1 && m.relationships.requires[0].id === "lib-wrapper");
} else {
  check("module.json not built yet (skipped)", true);
}

// Every localization key used in scripts and templates exists in lang/en.json.
const en = JSON.parse(fs.readFileSync(path.join(ROOT, "lang/en.json"), "utf8"));
const has = (key) => key.split(".").reduce((o, k) => o?.[k], en) !== undefined;
const sources = walk(path.join(ROOT, "scripts")).concat(walk(path.join(ROOT, "templates")));
const keys = new Set(sources.flatMap((f) => fs.readFileSync(f, "utf8").match(/PMI\.[A-Za-z]+\.[A-Za-z.]+[A-Za-z]/g) ?? []));
for (const k of keys) check(`localization key exists: ${k}`, has(k));
