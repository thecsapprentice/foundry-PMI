import { Rng } from "../scripts/generator/rng.mjs";
import { resolveParam, substitute } from "../scripts/generator/params.mjs";
import { categorize, isMundane } from "../scripts/generator/categories.mjs";
import { newRecipe, roll, rerollPick, rerollParams, toggleLock, tally, invalidPicks, addPick, blockReason, weightFor } from "../scripts/generator/roller.mjs";
import { loadAll, fixture, spellPool } from "./load-node.mjs";
import { spellCandidates } from "../scripts/generator/params.mjs";
import { kindOf } from "../scripts/generator/categories.mjs";
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

// Spells.
const spells = spellPool();
check("wand, staff and rod are recognised", kindOf(categorize(fixture("wand"))) === "wand" && kindOf(categorize(fixture("staff"))) === "staff" && kindOf(categorize(fixture("rod"))) === "rod");
check("a staff is also a weapon", categorize(fixture("staff")).includes("weapon"));
check("a plain quarterstaff isn't a staff", !categorize({ type: "weapon", system: { type: { value: "simpleM", baseItem: "quarterstaff" }, properties: ["ver"] } }).includes("staff"));
const evo3 = spellCandidates({ minLevel: 3, maxLevel: 3, school: "evo", classes: ["wizard"] }, "rare", spells);
check("spell filters: level, school, class", evo3.length > 0 && evo3.every((sp) => sp.level === 3 && sp.school === "evo" && sp.classes.includes("wizard")));
check("spell filter: no concentration", spellCandidates({ minLevel: 1, maxLevel: 9, concentration: false }, "rare", spells).every((sp) => !sp.concentration));
check("spell filter: level by rarity", spellCandidates({ minLevel: { byRarity: { rare: 3 } }, maxLevel: { byRarity: { rare: 3 } } }, "rare", spells).every((sp) => sp.level === 3));
check("spell filter: excluded UUIDs", !spellCandidates({ minLevel: 3, maxLevel: 3 }, "rare", spells, new Set([evo3[0].uuid])).some((sp) => sp.uuid === evo3[0].uuid));

const staffCats = categorize(fixture("staff"));
let distinct = true, staffRolls = 0, spellsSeen = 0;
for (let i = 0; i < 60; i++) {
  const r = roll(newRecipe({ seed: `st${i}`, rarity: "legendary" }), { properties, categories: staffCats, spells });
  const uuids = r.picks.flatMap((p) => Object.values(p.params).filter((v) => v?.uuid).map((v) => v.uuid));
  if (new Set(uuids).size !== uuids.length) distinct = false;
  if (uuids.length) staffRolls++;
  spellsSeen += uuids.length;
}
check("rolled staves get spells", staffRolls > 30, `${staffRolls}/60`);
check("an item never gets the same spell twice", distinct);
const noPool = roll(newRecipe({ seed: "np", rarity: "rare" }), { properties, categories: categorize(fixture("wand")) });
check("without a spell pool, spell properties are skipped", noPool.picks.every((p) => !getDef(p.id).slot.startsWith("spell")));
const tinyPool = spells.filter((sp) => sp.level === 1 && sp.activation === "action").slice(0, 1);
const one = addPick(newRecipe({ seed: "tp", rarity: "rare" }), getDef("spell-1"), { spells: tinyPool });
check("rerolling with only one possible spell keeps it", rerollParams(one, 0, { properties, spells: tinyPool })?.picks[0].params.spell.uuid === tinyPool[0].uuid);
check("a second level-1 spell property is blocked when the pool is used up", blockReason(getDef("spell-1"), one, categorize(fixture("wand")), getDef, { spells: tinyPool }) !== null);
check("Abundant needs a spell on the item", blockReason(getDef("abundant"), newRecipe({ seed: "x", rarity: "rare" }), categorize(fixture("wand")), getDef, { spells }) === "requires");
check("Abundant is allowed once there's a spell", blockReason(getDef("abundant"), one, categorize(fixture("wand")), getDef, { spells }) === null);

// Worn items and 2024-style wands.
const { getBase } = loadAll();
check("2024 wand (trinket with identifier) is a wand", kindOf(categorize({ type: "equipment", system: { type: { value: "trinket" }, identifier: "wand", properties: [] } })) === "wand");
check("2024 rod is a rod", kindOf(categorize({ type: "equipment", system: { type: { value: "trinket" }, identifier: "rod", properties: [] } })) === "rod");
check("a plain trinket isn't a base", categorize({ type: "equipment", system: { type: { value: "trinket" }, identifier: "lucky-coin" } }).length === 0);
check("an unidentified ring-type item is a worn ring", JSON.stringify(categorize({ type: "equipment", system: { type: { value: "ring" } } })) === '["worn","ring"]');
check("boots are worn on the feet", JSON.stringify(categorize(getBase("boots"))) === '["worn","feet"]');
check("worn kind", kindOf(categorize(getBase("circlet"))) === "worn");
check("weightBy multiplies on matching slots", weightFor(getDef("striding"), ["worn", "feet"]) === getDef("striding").weight * 4 && weightFor(getDef("striding"), ["worn", "ring"]) === getDef("striding").weight);
let striding = { feet: 0, ring: 0 };
for (const slot of ["feet", "ring"]) for (let i = 0; i < 200; i++) {
  const r = roll(newRecipe({ seed: `ws${i}`, rarity: "uncommon" }), { properties, categories: ["worn", slot], spells });
  if (r.picks.some((p) => p.id === "striding")) striding[slot]++;
}
check("boots roll Striding more often than rings", striding.feet > striding.ring * 2, JSON.stringify(striding));
check("weapon properties never land on worn items", Array.from({ length: 100 }, (_, i) => roll(newRecipe({ seed: `wn${i}`, rarity: "legendary" }), { properties, categories: ["worn", "neck"], spells })).every((r) => r.picks.every((p) => getDef(p.id).appliesTo.some((c) => ["worn", "neck"].includes(c)))));
