// True names and unidentified appearances.
import { compile } from "../scripts/compiler/index.mjs";
import { formOf, themesOf, inventWord, joinCompound, nameItem } from "../scripts/compiler/truename.mjs";
import { categorize } from "../scripts/generator/categories.mjs";
import { newRecipe, roll, addPick } from "../scripts/generator/roller.mjs";
import { Rng } from "../scripts/generator/rng.mjs";
import { loadAll, fixture, spellPool } from "./load-node.mjs";
import { check } from "./check.mjs";

const { properties, getDef, getTranslator, getBase, getNames } = loadAll();
const names = getNames();
const spells = spellPool();
const opts = { getDef, getTranslator, names, trueNameMinRarity: "rare" };

check("vocabulary loads", !!names && Object.keys(names.themes).length >= 30 && Object.keys(names.forms).length >= 15);
for (const [k, t] of Object.entries(names.themes)) {
  const ok = ["roots", "figures", "singles", "looks", "auras"].every((f) => Array.isArray(t[f]) && t[f].length);
  if (!ok) check(`theme ${k} has every word list`, false);
}
check("every theme has every word list", Object.values(names.themes).every((t) => ["roots", "figures", "singles", "looks", "auras"].every((f) => t[f]?.length)));
check("every form has suffixes and nouns", Object.values(names.forms).every((f) => f.suffixes?.length && f.nouns?.length));

// Every property theme resolves to a real theme for every parameter value.
let themed = true, why = "";
for (const def of properties.filter((d) => d.theme)) {
  const variants = Object.entries(def.params ?? {}).find(([, sp]) => sp.pick)?.[1].pick ?? [null];
  for (const v of variants) {
    const key = Object.entries(def.params ?? {}).find(([, sp]) => sp.pick)?.[0];
    const params = key ? { [key]: v } : {};
    if (def.theme.includes("spell")) continue;
    const t = themesOf([{ def, pick: { params } }], names.themes);
    if (!t.length) { themed = false; why = `${def.id} ${JSON.stringify(v)}`; }
  }
}
check("every property theme exists in the vocabulary", themed, why);
for (const school of ["abj", "con", "div", "enc", "evo", "ill", "nec", "trs"]) check(`spell school theme ${school}`, !!names.themes[school]);

check("forms: longsword is a blade", formOf(categorize(fixture("longsword"))) === "blade");
check("forms: greataxe is an axe, shortbow a bow", formOf(categorize(fixture("greataxe"))) === "axe" && formOf(categorize(fixture("shortbow"))) === "bow");
check("forms: boots are feet, staff is staff", formOf(categorize(getBase("boots"))) === "feet" && formOf(categorize(fixture("staff"))) === "staff");
check("compounds hyphenate clashing letters", joinCompound("Ash", "hewer") === "Ash-hewer" && joinCompound("Ember", "fang") === "Emberfang");

// Invented words: pronounceable lengths, no triples, no echoing syllables, plenty of variety.
const words = new Set();
let wordsOk = true;
for (let i = 0; i < 400; i++) {
  const tongue = Object.values(names.tongues)[i % 4];
  const w = inventWord(tongue, new Rng(`w${i}`));
  words.add(w);
  if (w.length < 4 || w.length > 11 || /(.)\1\1/i.test(w) || !/^[A-Z][a-z]+$/.test(w)) { wordsOk = false; why = w; }
}
check("invented words are tidy", wordsOk, why);
check("invented words vary (≥ 85% distinct in 400)", words.size >= 340, `${words.size}`);

// Through the compiler.
const pick = (id, params) => ({ id, seed: `n-${id}`, locked: false, params });
const flaming = (rarity, naming) => compile({ ...newRecipe({ seed: "nm1", rarity, baseUuid: "x" }), naming, picks: [
  pick("elemental", { element: { value: "fire", name: "Flaming", label: "Fire" }, die: "1d6" }), pick("weapon-plus-1", {})] }, fixture("longsword"), opts);
const unc = flaming("uncommon");
check("uncommon items keep the descriptive name", unc.data.name === "Flaming Longsword +1");
check("uncommon items still get an unidentified look", unc.data.system.unidentified.name !== "Longsword" && unc.data.system.unidentified.name.endsWith("Longsword"));
const rare = flaming("rare");
check("rare items take their true name", rare.data.name === rare.naming.trueName && rare.data.name !== "Flaming Longsword +1", rare.data.name);
check("the descriptive name leads the description", rare.data.system.description.value.startsWith('<p class="pmi-full-name"><strong>Flaming Longsword +1</strong></p>'));
check("unidentified description hints at fire", /smoke|warm/i.test(rare.data.system.unidentified.description), rare.data.system.unidentified.description);
check("names are reproducible", flaming("rare").data.name === rare.data.name);
const rerolled = flaming("rare", { mode: "auto", custom: "", rerolls: 1 });
check("rerolling the name changes it", rerolled.data.name !== rare.data.name, `${rare.data.name} / ${rerolled.data.name}`);
check("descriptive mode", flaming("legendary", { mode: "descriptive", custom: "", rerolls: 0 }).data.name === "Flaming Longsword +1");
check("true mode on an uncommon item", flaming("uncommon", { mode: "true", custom: "", rerolls: 0 }).naming.usesTrueName);
const custom = flaming("rare", { mode: "custom", custom: "  Mom's Butter Knife ", rerolls: 0 });
check("custom names are used, trimmed", custom.data.name === "Mom's Butter Knife");
check("custom names are escaped in the description", flaming("rare", { mode: "custom", custom: "<b>x</b>", rerolls: 0 }).data.system.description.value.includes("<strong>Flaming Longsword +1</strong>"));
check("no vocabulary means descriptive names", compile({ ...newRecipe({ seed: "nm1", rarity: "legendary", baseUuid: "x" }), picks: [pick("weapon-plus-1", {})] }, fixture("longsword"), { getDef, getTranslator }).data.name === "Longsword +1");

// Many items: names never repeat their form word, and stay a sensible length.
let echo = true, len = true, legendaryTitled = 0, samples = 0;
for (const base of ["longsword", "greataxe", "shortbow", "chain-mail", "shield", "staff"].map(fixture).concat(["cloak", "boots", "ring", "amulet", "wand", "circlet"].map(getBase))) {
  for (const rarity of ["rare", "veryRare", "legendary"]) for (let i = 0; i < 20; i++) {
    const r = roll(newRecipe({ seed: `nv${i}`, rarity }), { properties, categories: categorize(base), spells });
    const res = compile(r, base, opts);
    if (!res.data) continue;
    samples++;
    const n = res.data.name;
    if (/\b(\w+)\b.*\b\1\b/i.test(n.replace(/'s\b/g, ""))) echo = false;
    if (n.length > 48) len = false;
    if (rarity === "legendary" && n.includes(",")) legendaryTitled++;
  }
}
check("names never repeat a word", echo);
check("names stay under 48 characters", len);
check("legendary items mostly get a name and epithet", legendaryTitled >= samples / 3 * 0.8, `${legendaryTitled}`);
