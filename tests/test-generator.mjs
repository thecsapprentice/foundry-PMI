import { Rng } from "../scripts/generator/rng.mjs";
import { resolveParam, substitute } from "../scripts/generator/params.mjs";
import { categorize, isMundane } from "../scripts/generator/categories.mjs";
import { newRecipe, roll, rerollPick, rerollParams, toggleLock, tally, invalidPicks, addPick } from "../scripts/generator/roller.mjs";
import { loadAll, fixture } from "./load-node.mjs";
import { check } from "./check.mjs";

const rng = new Rng("params");
check("byRarity picks this rarity", resolveParam({ byRarity: { uncommon: "1d4", rare: "1d6" } }, "rare", rng) === "1d6");
check("byRarity falls back to the nearest lower rarity", resolveParam({ byRarity: { uncommon: "1d4", rare: "1d6" } }, "legendary", rng) === "1d6");
check("byRarity uses the lowest when nothing is lower", resolveParam({ byRarity: { rare: "1d6" } }, "common", rng) === "1d6");
check("range stays in range", Array.from({ length: 200 }, () => resolveParam({ range: [2, 4] }, "rare", rng)).every((n) => n >= 2 && n <= 4));

const vars = { die: "1d6", element: { value: "fire", name: "Flaming" }, threshold: 19 };
check("whole @var keeps its type", substitute("@threshold", vars) === 19);
check("object param stands for its value", substitute("@element", vars) === "fire");
check("inline @var is spliced", substitute("[[/damage @die @element]]", vars) === "[[/damage 1d6 fire]]");
check("{name.key} reads a field", substitute("{element.name} Sword", vars) === "Flaming Sword");
check("@var inside a key path", substitute("system.abilities.@a.bonuses.save", { a: { value: "wis" } }) === "system.abilities.wis.bonuses.save");
const missing = new Set();
substitute(["@nope", "x {nope.k}"], vars, missing);
check("unknown variables are reported", missing.has("nope") && missing.has("nope.k"));

check("longsword categories", JSON.stringify(categorize(fixture("longsword"))) === JSON.stringify(["weapon", "weapon.melee", "weapon.martial", "weapon.longsword"]));
check("shortbow is ranged", categorize(fixture("shortbow")).includes("weapon.ranged"));
check("chain mail is heavy armor", categorize(fixture("chain-mail")).includes("armor.heavy"));
check("shield is a shield", JSON.stringify(categorize(fixture("shield"))) === '["shield"]');
check("unsupported types get no categories", categorize({ type: "loot", system: {} }).length === 0);
check("fixtures are mundane", ["longsword", "chain-mail", "shield"].every((n) => isMundane(fixture(n))));

const { properties, getDef, errors } = loadAll();
check("property files register cleanly", errors.length === 0, errors.join("; "));

const cats = categorize(fixture("longsword"));
const r1 = roll(newRecipe({ seed: "abcd-efgh", rarity: "rare" }), { properties, categories: cats });
const r2 = roll(newRecipe({ seed: "abcd-efgh", rarity: "rare" }), { properties, categories: cats });
check("rolling is reproducible", JSON.stringify(r1) === JSON.stringify(r2));
check("a rare roll has picks", r1.picks.length > 0);
check("a roll stays within budget", tally(r1, getDef).remaining >= 0);
check("a roll has no invalid picks", invalidPicks(r1, { properties, categories: cats }).length === 0);

// Many rolls: budget, caps, slots and exclusion groups always respected.
let ok = true, detail = "";
for (const base of ["longsword", "dagger", "shortbow", "greataxe", "chain-mail", "leather-armor", "shield"]) {
  const categories = categorize(fixture(base));
  for (const rarity of ["uncommon", "rare", "veryRare", "legendary"]) {
    for (let i = 0; i < 40; i++) {
      const r = roll(newRecipe({ seed: `s${i}`, rarity }), { properties, categories });
      const t = tally(r, getDef);
      const bad = invalidPicks(r, { properties, categories });
      if (t.remaining < 0 || t.count > t.maxProperties || bad.length) { ok = false; detail = `${base} ${rarity} s${i}: ${JSON.stringify(bad)} ${JSON.stringify(t)}`; }
    }
  }
}
check("1,120 random rolls all respect the rules", ok, detail);

// Locks survive a reroll; rerolling one pick leaves the others alone.
const locked = toggleLock(r1, 0);
const again = roll({ ...locked, rerolls: 5 }, { properties, categories: cats });
check("a locked pick survives a full reroll", JSON.stringify(again.picks[0]) === JSON.stringify(locked.picks[0]));
if (r1.picks.length >= 2) {
  const one = rerollPick(r1, 1, { properties, categories: cats });
  check("rerollPick changes only that pick", one === null || (JSON.stringify(one.picks[0]) === JSON.stringify(r1.picks[0]) && one.picks[1].id !== r1.picks[1].id));
}
const el = addPick(newRecipe({ seed: "el", rarity: "rare" }), getDef("elemental"));
const seen = new Set();
let cur = el;
for (let i = 0; i < 30; i++) { cur = rerollParams(cur, 0, { properties }); seen.add(cur.picks[0].params.element.value); }
check("rerollParams varies the parameter", seen.size >= 3, [...seen].join(","));
check("rerollParams keeps the property", cur.picks[0].id === "elemental");

const tooLow = addPick(newRecipe({ seed: "x", rarity: "uncommon" }), getDef("weapon-plus-3"));
check("invalidPicks reports a property below its rarity", invalidPicks(tooLow, { properties, categories: cats })[0]?.reason === "rarityLow");
