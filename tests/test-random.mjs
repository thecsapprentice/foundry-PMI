import { Rng } from "../scripts/generator/rng.mjs";
import { randomRarity, randomBase } from "../scripts/generator/random.mjs";
import { check } from "./check.mjs";

const rng = new Rng("random-tests");
const counts = {};
for (let i = 0; i < 4000; i++) { const r = randomRarity(rng, null); counts[r] = (counts[r] ?? 0) + 1; }
check("random rarity is never common or artifact", !counts.common && !counts.artifact, JSON.stringify(counts));
check("random rarity favours lower rarities", counts.uncommon > counts.rare && counts.rare > counts.veryRare && counts.veryRare > counts.legendary, JSON.stringify(counts));
check("random rarity always changes the current one", Array.from({ length: 500 }, () => randomRarity(rng, "rare")).every((r) => r !== "rare"));

const entries = [
  { uuid: "a", kind: "weapon" }, { uuid: "b", kind: "weapon" },
  { uuid: "c", kind: "armor" }, { uuid: "d", kind: "shield" },
];
check("random weapon is a weapon", Array.from({ length: 200 }, () => randomBase(entries, "weapon", rng)).every((e) => e.kind === "weapon"));
check("random any covers every kind", new Set(Array.from({ length: 400 }, () => randomBase(entries, "any", rng).kind)).size === 3);
check("random base avoids the current one when it can", Array.from({ length: 200 }, () => randomBase(entries, "weapon", rng, "a")).every((e) => e.uuid === "b"));
check("random base keeps the only option", randomBase(entries, "shield", rng, "d")?.uuid === "d");
check("random base is null when nothing fits", randomBase(entries.filter((e) => e.kind !== "shield"), "shield", rng) === null);
