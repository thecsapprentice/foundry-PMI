// Drawbacks (the curse slot), power limits and name words.
import { compile } from "../scripts/compiler/index.mjs";
import { categorize } from "../scripts/generator/categories.mjs";
import {
  newRecipe, addPick, roll, tally, blockReason, addRandomCurse, rerollPick, invalidPicks, conflicts,
} from "../scripts/generator/roller.mjs";
import { resolveParam, chooseNames, cappedRarity } from "../scripts/generator/params.mjs";
import { validateProperty } from "../scripts/api.mjs";
import { Rng } from "../scripts/generator/rng.mjs";
import { DEFAULT_LIMITS, SLOTS } from "../scripts/config.mjs";
import { loadAll, fixture, spellPool } from "./load-node.mjs";
import { check, throws } from "./check.mjs";

const { properties, getDef, getTranslator, getBase, listBases } = loadAll();
const opts = { getDef, getTranslator };
const spells = spellPool();
const curses = properties.filter((d) => d.slot === "curse");
const cats = (name) => categorize(fixture(name));
const recipeWith = (rarity, ids, seed = "curse-seed", limits) => {
  let r = newRecipe({ seed, rarity });
  for (const id of ids) r = addPick(r, getDef(id), { spells, limits });
  return r;
};
const build = (base, rarity, ids, seed) => compile(recipeWith(rarity, ids, seed), fixture(base), opts);

// ---------------- definitions ----------------
check("at least 15 drawbacks ship", curses.length >= 15, String(curses.length));
check("drawbacks are the last slot", SLOTS.at(-1) === "curse");
check("every drawback costs 0 or less", curses.every((d) => d.cost <= 0));
check("the user's examples are all there",
  ["curse-feeble", "curse-leaden", "curse-noisy", "curse-benighted", "curse-spined", "curse-ponderous", "curse-recalcitrant", "curse-neutral"].every((id) => getDef(id)));
check("a drawback with a positive cost is refused", validateProperty({ id: "x", slot: "curse", cost: 1, appliesTo: ["weapon"], changes: [] }).length === 1);
check("a blessing with a negative cost is refused", validateProperty({ id: "x", slot: "prefix", cost: -1, appliesTo: ["weapon"], changes: [] }).length === 1);
check("a list of names is accepted", validateProperty({ id: "x", slot: "prefix", cost: 1, name: ["A", "B"], appliesTo: ["weapon"], changes: [] }).length === 0);
check("an empty name list is refused", validateProperty({ id: "x", slot: "prefix", cost: 1, name: [], appliesTo: ["weapon"], changes: [] }).length === 1);

// ---------------- budget ----------------
let r = recipeWith("uncommon", ["weapon-plus-1", "curse-leaden", "curse-recalcitrant"]);
let t = tally(r, getDef);
check("drawbacks give budget back", t.budget === 3 + 3 && t.refund === 3 && t.baseBudget === 3, JSON.stringify(t));
check("drawbacks don't count as properties", t.count === 1 && t.curses === 2);
check("a drawback is never blocked by the property cap", blockReason(getDef("curse-feeble"), recipeWith("uncommon", ["keen", "of-the-night"]), cats("longsword"), getDef) === null
  && blockReason(getDef("vigilant"), recipeWith("uncommon", ["keen", "of-the-night"]), cats("longsword"), getDef, { ignoreBudget: true }) === "maxProperties");
check("the drawback slot holds two", blockReason(getDef("curse-feeble"), r, cats("longsword"), getDef) === "slotFull");
check("bound needs another drawback", blockReason(getDef("curse-bound"), recipeWith("rare", []), cats("longsword"), getDef) === "requires"
  && blockReason(getDef("curse-bound"), recipeWith("rare", ["curse-leaden"]), cats("longsword"), getDef) === null);
check("weapon drawbacks stay off armor", blockReason(getDef("curse-spined"), recipeWith("rare", []), cats("chain-mail"), getDef) === "category");

// ---------------- clashes ----------------
check("Neutral can't join a property that gives advantage", conflicts(getDef("curse-neutral"), [getDef("skilled")]) && conflicts(getDef("skilled"), [getDef("curse-neutral")]));
check("two advantage properties still go together", !conflicts(getDef("skilled"), [getDef("save-advantage")]));
check("Benighted clashes with darkvision", blockReason(getDef("curse-benighted"), recipeWith("rare", ["of-the-night"]), cats("longsword"), getDef) === "exclusive");
check("Leaden clashes with extra speed", blockReason(getDef("of-swiftness"), recipeWith("rare", ["curse-leaden"]), cats("longsword"), getDef) === "exclusive");
check("Feeble clashes with a set ability score", conflicts(getDef("curse-feeble"), [getDef("ability-score")]));
check("only one stealth drawback", blockReason(getDef("curse-clanking"), recipeWith("rare", ["curse-noisy"]), cats("chain-mail"), getDef) === "exclusive");

// ---------------- rolling ----------------
const ctx = (base, extra = {}) => ({ properties, categories: cats(base), spells, ...extra });
let none = 0, one = 0, extra = 0;
for (let i = 0; i < 40; i++) {
  const plain = roll(newRecipe({ seed: `r${i}`, rarity: "rare" }), ctx("longsword"));
  if (plain.picks.some((p) => getDef(p.id).slot === "curse")) none++;
  const cursed = roll(newRecipe({ seed: `r${i}`, rarity: "rare" }), ctx("longsword", { curseChance: 1 }));
  const n = cursed.picks.filter((p) => getDef(p.id).slot === "curse").length;
  if (n === 1) one++;
  if (tally(cursed, getDef).spent > 6) extra++;
}
check("with no drawback chance, rolls never add one", none === 0);
check("with a 100% chance, every roll adds exactly one", one === 40, String(one));
check("the refund buys more than the plain budget sometimes", extra > 0, String(extra));
const locked = recipeWith("rare", ["curse-flimsy"]);
locked.picks[0].locked = true;
const relocked = roll(locked, ctx("chain-mail", { curseChance: 1 }));
check("a locked drawback isn't joined by a random one", relocked.picks.filter((p) => getDef(p.id).slot === "curse").length === 1);

let c1 = addRandomCurse(newRecipe({ seed: "a", rarity: "rare" }), ctx("longsword"));
let c2 = addRandomCurse(c1, ctx("longsword"));
check("the Drawback button adds a drawback", c1.picks.length === 1 && getDef(c1.picks[0].id).slot === "curse");
check("…and a second, different one", c2.picks.length === 2 && c2.picks[0].id !== c2.picks[1].id);
check("…then nothing when the slot is full", addRandomCurse(c2, ctx("longsword")) === null);
const swapped = rerollPick(c1, 0, ctx("longsword"));
check("rerolling a drawback gives another drawback", getDef(swapped.picks[0].id).slot === "curse" && swapped.picks[0].id !== c1.picks[0].id);
const bless = rerollPick(recipeWith("rare", ["keen"]), 0, ctx("longsword"));
check("rerolling a blessing never gives a drawback", getDef(bless.picks[0].id).slot !== "curse");

// Every base, every drawback roll compiles.
const bases = ["longsword", "dagger", "shortbow", "greataxe", "chain-mail", "leather-armor", "shield", "wand", "staff", "rod"];
let ok = true, why = "";
for (const base of bases) for (const rarity of ["uncommon", "rare", "veryRare", "legendary"]) for (let i = 0; i < 15; i++) {
  const rr = roll(newRecipe({ seed: `k${i}`, rarity }), ctx(base, { curseChance: 1, limits: DEFAULT_LIMITS }));
  const { errors, data } = compile(rr, fixture(base), opts);
  if (errors.length || !data) { ok = false; why = `${base} ${rarity} k${i}: ${errors.join("; ")}`; }
}
for (const b of listBases()) for (let i = 0; i < 10; i++) {
  const base = getBase(b.id);
  const rr = roll(newRecipe({ seed: `b${i}`, rarity: "rare" }), { properties, categories: categorize(base), spells, curseChance: 1 });
  const { errors } = compile(rr, base, opts);
  if (errors.length) { ok = false; why = `${b.id} b${i}: ${errors.join("; ")}`; }
}
check("cursed random rolls compile on every base", ok, why);

// ---------------- compiled drawbacks ----------------
const acts = (data) => Object.values(data.system.activities);
let { data } = build("longsword", "rare", ["keen", "curse-spined"], "spines");
const bite = acts(data).find((a) => a.type === "damage");
check("Spined adds a damage activity aimed at the wielder", bite?.target.affects.type === "self" && bite.damage.parts[0].types.includes("piercing"));
check("…used automatically on a hit", bite.activation.type === "special" && /hit/.test(bite.activation.condition)
  && data.flags["foundry-pmi"].triggers.some((tr) => tr.on === "hit" && tr.activity === bite._id));
check("the drawback's word leads the descriptive name", /^(Spined|Barbed|Thorned) /.test(data.name), data.name);
check("the drawback is described last, as a drawback", /<li><p><strong>Drawback: [^<]+<\/strong>[^<]*spines[\s\S]*<\/ul>/i.test(data.system.description.value)
  && data.system.description.value.indexOf("Drawback:") > data.system.description.value.indexOf("<li>"));

({ data } = build("longsword", "rare", ["curse-treacherous"]));
check("Treacherous fires on a natural 1", data.flags["foundry-pmi"].triggers[0].on === "fumble");

({ data } = build("chain-mail", "rare", ["curse-recalcitrant"]));
const coax = acts(data).find((a) => a.type === "check");
check("Recalcitrant asks for Persuasion or Intimidation", JSON.stringify(coax?.check.associated) === '["per","itm"]' && coax.check.dc.formula === "15");
check("…at dawn", data.flags["foundry-pmi"].triggers[0].on === "dawn" && /dawn/i.test(coax.activation.condition));

({ data } = build("longsword", "rare", ["curse-neutral"]));
const neutral = data.effects.find((e) => e.flags["foundry-pmi"].property === "curse-neutral");
check("Neutral forces normal rolls on 33 roll types", neutral.changes.length === 33 && neutral.changes.every((ch) => ch.mode === 5 && ch.value === "0"));
check("…including skills, saves, initiative and death saves",
  ["system.skills.ste.roll.mode", "system.abilities.wis.save.roll.mode", "system.attributes.init.roll.mode", "system.attributes.death.roll.mode"].every((k) => neutral.changes.some((ch) => ch.key === k)));

({ data } = build("longsword", "rare", ["curse-ponderous"]));
check("Ponderous quadruples the weight", data.system.weight.value === fixture("longsword").system.weight.value * 4);
({ data } = build("chain-mail", "rare", ["curse-clanking"]));
check("Clanking marks the armor with Stealth disadvantage", data.system.properties.includes("stealthDisadvantage"));
({ data } = build("longsword", "rare", ["curse-unwieldy"]));
check("Unwieldy lowers the attack bonus", acts(data).find((a) => a.type === "attack").attack.bonus === "-1");
({ data } = build("longsword", "rare", ["curse-benighted"]));
check("Benighted overrides darkvision to 0", data.effects.at(-1).changes[0].key === "system.attributes.senses.darkvision" && data.effects.at(-1).changes[0].mode === 5);
({ data } = build("longsword", "rare", ["curse-feeble"]));
check("Feeble lowers an ability score", /^system\.abilities\.\w+\.value$/.test(data.effects.at(-1).changes[0].key) && data.effects.at(-1).changes[0].value === "-1");
({ data } = build("longsword", "rare", ["curse-leaden", "curse-bound"]));
check("Bound requires attunement", data.system.attunement === "required");

// ---------------- power limits ----------------
check("byRarity stops at the tier", cappedRarity("legendary", { tier: "rare" }) === "rare" && cappedRarity("uncommon", { tier: "rare" }) === "uncommon");
const score = getDef("ability-score").params.score;
const rng = new Rng("x");
check("without limits a legendary ability score is 25", resolveParam(score, "legendary", rng) === 25);
check("the default limits hold it to 23", resolveParam(score, "legendary", rng, { limits: DEFAULT_LIMITS }) === 23);
check("a GM limit of 21 holds it to 21", resolveParam(score, "legendary", rng, { limits: { ...DEFAULT_LIMITS, abilityScore: 21 } }) === 21);
check("a rare tier holds it to rare's 21", resolveParam(score, "legendary", rng, { limits: { tier: "rare" } }) === 21);
check("other numbers stop at the tier too", resolveParam(getDef("hearty").params.hp, "legendary", rng, { limits: { tier: "veryRare" } }) === 1);
check("flat bonuses are held to the bonus limit", resolveParam(getDef("of-protection").params.bonus, "legendary", rng, { limits: { bonus: 1 } }) === 1);
const two = { ...DEFAULT_LIMITS, bonus: 2 };
check("+3 weapons are left out when the limit is +2", blockReason(getDef("weapon-plus-3"), recipeWith("veryRare", []), cats("longsword"), getDef, { limits: two }) === "powerCap");
check("+2 weapons still fit", blockReason(getDef("weapon-plus-2"), recipeWith("veryRare", []), cats("longsword"), getDef, { limits: two }) === null);
let rolledOver = false;
for (let i = 0; i < 30; i++) {
  const rr = roll(newRecipe({ seed: `p${i}`, rarity: "legendary" }), ctx("longsword", { limits: two }));
  if (rr.picks.some((p) => p.id === "weapon-plus-3")) rolledOver = true;
}
check("rolls respect the bonus limit", !rolledOver);
const draft = recipeWith("veryRare", ["weapon-plus-3"]);
check("an existing draft over the limit is marked", invalidPicks(draft, { properties, categories: cats("longsword"), limits: two })[0]?.reason === "powerCap");
const belt = recipeWith("legendary", ["ability-score"], "belt", DEFAULT_LIMITS);
check("ability-score rolls carry the limited score", belt.picks[0].params.score === 23);

// ---------------- name words ----------------
const keen = getDef("keen");
check("properties offer three name words", Array.isArray(keen.name) && keen.name.length === 3);
const pk = { id: "keen", seed: "s1", params: {} };
const words = new Set();
for (let i = 0; i < 30; i++) words.add(chooseNames(keen, pk, `seed/words/${i}`).name);
check("name rerolls reach every word", words.size === 3, [...words].join(","));
check("the same key gives the same word", chooseNames(keen, pk, "k").name === chooseNames(keen, pk, "k").name);
const elem = { id: "elemental", seed: "s2", params: { element: { value: "cold", name: ["Icy", "Frosty", "Rime-Touched"], label: "Cold" } } };
const chosen = chooseNames(getDef("elemental"), elem, "k").params.element.name;
check("parameter entries choose one of their words", ["Icy", "Frosty", "Rime-Touched"].includes(chosen));
let names = new Set();
for (let i = 0; i < 12; i++) {
  const rr = recipeWith("uncommon", ["keen", "elemental"], "words");
  rr.naming.rerolls = i;
  names.add(compile(rr, fixture("longsword"), opts).data.name);
}
check("rerolling the name changes the descriptive words", names.size >= 4, [...names].join(" | "));
check("no names contain list commas", [...names].every((n) => !n.includes(",")));
const honed = chooseNames(keen, pk, [...Array(30).keys()].map((i) => `seed/words/${i}`).find((k) => chooseNames(keen, pk, k).name !== "Keen"));
check("a label written with the first word follows the chosen word", honed.label.startsWith(honed.name) && !honed.label.includes("Keen"), honed.label);
const lead = getDef("curse-leaden");
check("…for drawbacks too", [...Array(20).keys()].every((i) => { const c = chooseNames(lead, { id: lead.id, seed: "z" }, `w${i}`); return c.label.startsWith(c.name); }));
check("Clanking can't undo Featherlight", blockReason(getDef("curse-clanking"), recipeWith("rare", ["featherlight"]), cats("chain-mail"), getDef) === "exclusive");
check("Ponderous can't join Featherlight", blockReason(getDef("curse-ponderous"), recipeWith("rare", ["featherlight"]), cats("chain-mail"), getDef) === "exclusive");

// Tomes: a wand in book form.
const { kindOf } = await import("../scripts/generator/categories.mjs");
const tome = getBase("tome");
check("the built-in tome is a tome and a wand", JSON.stringify(categorize(tome)) === '["tome","wand"]' && kindOf(categorize(tome)) === "tome");
check("it's a spellcasting focus", tome.system.properties.includes("foc"));
let tr = newRecipe({ seed: "tome", rarity: "rare" });
tr = addPick(tr, getDef("spell-3"), { spells });
const tomeItem = compile(tr, tome, { ...opts, names: (await import("../scripts/api.mjs")).getNames() }).data;
const tomeCast = Object.values(tomeItem.system.activities).find((a) => a.type === "cast");
check("a tome's spells cost what a wand's do (1 charge)", tomeCast.consumption.targets[0].value === "1");
check("a tome gets a wand's charge pool (7, 1d6 + 1 at dawn)", tomeItem.system.uses.max === "7" && tomeItem.system.uses.recovery[0].formula === "1d6 + 1");
const tomeNames = new Set();
for (let i = 0; i < 25; i++) {
  const r2 = structuredClone(tr); r2.naming.rerolls = i; r2.naming.mode = "true";
  tomeNames.add(compile(r2, tome, { ...opts, names: (await import("../scripts/api.mjs")).getNames() }).data.name);
}
const bookish = /(tome|book|page|leaf|script|quill|codex|verse|scroll|rune|ink|word|lore|folio|grimoire|pages|litany|testament|treatise|chronicle|canticle|lexicon|almanac|psalter)/i;
check("tomes get bookish true names", [...tomeNames].filter((n) => bookish.test(n)).length >= 10, [...tomeNames].join(" | "));
const wandRolls = roll(newRecipe({ seed: "tr", rarity: "rare" }), { properties, categories: categorize(tome), spells });
check("tomes roll wand properties", wandRolls.picks.some((p) => getDef(p.id).appliesTo.includes("wand")));
