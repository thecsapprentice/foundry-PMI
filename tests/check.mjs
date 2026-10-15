// Tiny assertion helper. Each check prints PASS or FAIL; tests/run.mjs counts them.
export function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
export function throws(name, fn) {
  try { fn(); check(name, false, "did not throw"); } catch { check(name, true); }
}
