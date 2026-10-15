#!/usr/bin/env node
// Runs every PMI test suite.   node tests/run.mjs
// Exits non-zero if any check fails or a suite crashes.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const suites = fs.readdirSync(dir).filter((f) => /^test-.*\.mjs$/.test(f)).sort();

let pass = 0, fail = 0, crashed = 0;
for (const file of suites) {
  const r = spawnSync(process.execPath, [path.join(dir, file)], { encoding: "utf8", timeout: 120000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const p = (out.match(/^PASS/gm) ?? []).length;
  const f = out.split("\n").filter((l) => l.startsWith("FAIL"));
  pass += p; fail += f.length;
  const broken = r.status !== 0 || p === 0;
  if (broken) crashed++;
  console.log(`${broken || f.length ? "✗" : "✓"} ${file}: ${p} passed, ${f.length} failed${broken ? " — SUITE CRASHED" : ""}`);
  for (const l of f) console.log(`    ${l}`);
  if (broken) console.log(out.split("\n").slice(-15).map((l) => `    ${l}`).join("\n"));
}
console.log(`\n${pass} passed, ${fail} failed${crashed ? `, ${crashed} suite(s) crashed` : ""}`);
process.exit(fail || crashed ? 1 : 0);
