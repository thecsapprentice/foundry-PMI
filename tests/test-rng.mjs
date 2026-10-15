import { Rng, newSeed } from "../scripts/generator/rng.mjs";
import { check, throws } from "./check.mjs";

const seq = (seed, n = 20) => { const r = new Rng(seed); return Array.from({ length: n }, () => r.next()); };

check("same seed gives the same sequence", JSON.stringify(seq("abcd-efgh")) === JSON.stringify(seq("abcd-efgh")));
check("different seeds give different sequences", JSON.stringify(seq("abcd-efgh")) !== JSON.stringify(seq("abcd-efgj")));
check("next() stays in [0, 1)", seq("range", 10000).every((x) => x >= 0 && x < 1));

const a = new Rng("fork-test");
const prefix1 = a.fork("slot:prefix").next();
a.fork("slot:suffix").next(); a.next(); a.next();
const prefix2 = a.fork("slot:prefix").next();
check("forked streams don't depend on other draws", prefix1 === prefix2);
check("different fork labels differ", new Rng("x").fork("a").next() !== new Rng("x").fork("b").next());

const r = new Rng("ints");
const ints = Array.from({ length: 5000 }, () => r.int(1, 6));
check("int() stays in range", ints.every((n) => Number.isInteger(n) && n >= 1 && n <= 6));
check("int() reaches both ends", ints.includes(1) && ints.includes(6));
throws("int() rejects a reversed range", () => r.int(6, 1));

const counts = { a: 0, b: 0, c: 0 };
const w = new Rng("weights");
for (let i = 0; i < 20000; i++) counts[w.weighted([{ id: "a", weight: 1 }, { id: "b", weight: 3 }, { id: "c", weight: 0 }]).id]++;
check("weighted() never picks zero weight", counts.c === 0);
check("weighted() roughly follows weights", counts.b / counts.a > 2.5 && counts.b / counts.a < 3.5, JSON.stringify(counts));
check("weighted() returns null when nothing has weight", w.weighted([{ weight: 0 }]) === null);
throws("pick() rejects an empty array", () => w.pick([]));

const s = newSeed();
check("newSeed() has the form xxxx-xxxx", /^[a-z2-9]{4}-[a-z2-9]{4}$/.test(s), s);
throws("Rng rejects an empty seed", () => new Rng(""));
