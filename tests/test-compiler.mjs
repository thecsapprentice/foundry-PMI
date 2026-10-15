import { compile } from "../scripts/compiler/index.mjs";
import { damagePart } from "../scripts/compiler/damage.mjs";
import { categorize } from "../scripts/generator/categories.mjs";
import { newRecipe, addPick, roll } from "../scripts/generator/roller.mjs";
import { RARITIES } from "../scripts/config.mjs";
import { loadAll, fixture } from "./load-node.mjs";
import { check } from "./check.mjs";

const { properties, getDef, getTranslator } = loadAll();
const opts = { getDef, getTranslator };
const build = (base, rarity, ids, seed = "test-seed") => {
  let r = newRecipe({ seed, rarity, baseUuid: `Compendium.dnd5e.items.Item.${base}` });
  for (const id of ids) r = addPick(r, getDef(id));
  return compile(r, fixture(base), opts);
};

check("damagePart simple dice", JSON.stringify(damagePart("2d6", ["fire"])).includes('"number":2,"denomination":6'));
check("damagePart dice + bonus", damagePart("1d8+3").bonus === "3");
check("damagePart custom formula", damagePart("1d4 + @prof").custom.enabled === true);

// Every property compiles on every base it applies to, at every rarity it allows.
const bases = ["longsword", "dagger", "shortbow", "greataxe", "chain-mail", "leather-armor", "shield"];
let all = true, why = "";
for (const def of properties) {
  for (const base of bases) {
    if (!def.appliesTo.some((c) => categorize(fixture(base)).includes(c))) continue;
    for (const rarity of RARITIES.slice(RARITIES.indexOf(def.minRarity ?? "common"), RARITIES.indexOf(def.maxRarity ?? "artifact") + 1)) {
      const { data, errors, warnings } = build(base, rarity, [def.id]);
      if (!data || errors.length || warnings.length) { all = false; why = `${def.id} on ${base} at ${rarity}: ${[...errors, ...warnings].join("; ")}`; }
      if (data && /@\w|\{\w+(\.\w+)?\}/.test(JSON.stringify(data).replace(/@UUID|@Embed|@scale|@item|@prof|@mod/g, ""))) { all = false; why = `${def.id} on ${base}: unsubstituted variable left in data`; }
    }
  }
}
check("every property compiles everywhere it applies", all, why);

// Random rolls compile.
let rolled = true, rwhy = "";
for (const base of bases) for (const rarity of ["uncommon", "rare", "veryRare", "legendary"]) for (let i = 0; i < 25; i++) {
  const r = roll(newRecipe({ seed: `c${i}`, rarity }), { properties, categories: categorize(fixture(base)) });
  const { errors } = compile(r, fixture(base), opts);
  if (errors.length) { rolled = false; rwhy = `${base} ${rarity} c${i}: ${errors.join("; ")}`; }
}
check("700 random rolls compile without errors", rolled, rwhy);

// A specific item, checked field by field.
const { data } = build("longsword", "rare", ["elemental", "weapon-plus-1", "of-the-beast"], "fixed-seed");
const atk = Object.values(data.system.activities).find((a) => a.type === "attack");
check("name is built prefix-base-suffix-enhancement", /^\w+ Longsword of the \w+ \+1$/.test(data.name), data.name);
check("magical bonus set", data.system.magicalBonus === 1);
check("rarity set", data.system.rarity === "rare");
check("magical property added", data.system.properties.includes("mgc") && data.system.properties.includes("ver"));
check("attunement required by elemental", data.system.attunement === "required");
check("extra damage part on the attack", atk.damage.parts.length === 1 && atk.damage.parts[0].denomination === 6 && atk.damage.parts[0].types.length === 1);
check("base damage kept", data.system.damage.base.denomination === 8 && atk.damage.includeBase === true);
check("save bonus effect is transfer", data.effects.length === 1 && data.effects[0].transfer === true && /^system\.abilities\.\w{3}\.bonuses\.save$/.test(data.effects[0].changes[0].key));
check("effect value substituted", data.effects[0].changes[0].value === "+1");
check("effect has a stable 16-char id", /^[A-Za-z0-9]{16}$/.test(data.effects[0]._id));
check("recipe stored in flags", data.flags["foundry-pmi"].recipe.picks.length === 3);
check("no inherited _id, folder or ownership", !("_id" in data) && !("folder" in data) && !("ownership" in data));
check("description lists each property", (data.system.description.value.match(/<li>/g) ?? []).length === 3);
check("description uses enrichers", /\[\[\/damage 1d6 \w+\]\]/.test(data.system.description.value));
check("unidentified name is the base name", data.system.unidentified.name === "Longsword");
check("price includes the rarity price", data.system.price.value === fixture("longsword").system.price.value + 4000);
const again = build("longsword", "rare", ["elemental", "weapon-plus-1", "of-the-beast"], "fixed-seed").data;
check("compiling is reproducible (same ids)", JSON.stringify(again) === JSON.stringify(data));
check("compiling doesn't change the base fixture", fixture("longsword").name === "Longsword");

// Keen and vicious on the same weapon.
const kv = build("greataxe", "rare", ["keen", "vicious"]).data;
const kva = Object.values(kv.system.activities).find((a) => a.type === "attack");
check("keen sets the critical threshold", kva.attack.critical.threshold === 19);
check("vicious adds critical damage", kva.damage.critical.bonus === "2d6");

// Charges + save activity.
const th = build("longsword", "rare", ["of-thunder"]).data;
const save = Object.values(th.system.activities).find((a) => a.type === "save");
check("charges set", th.system.uses.max === "3" && th.system.uses.recovery[0].period === "dawn" && th.system.uses.recovery[0].type === "formula");
check("save activity spends a charge", save?.consumption.targets[0]?.type === "itemUses" && save.consumption.targets[0].value === "1");
check("save DC from rarity", save?.save.dc.formula === "15" && save.save.dc.calculation === "");
check("save damage half on success", save?.damage.onSave === "half" && save.damage.parts[0].number === 2 && save.damage.parts[0].denomination === 8);

// Armor.
const ar = build("chain-mail", "rare", ["armor-plus-1", "featherlight"]).data;
check("armor magical bonus on armor.magicalBonus", ar.system.armor.magicalBonus === 1 && ar.system.magicalBonus === undefined);
check("featherlight removes stealth disadvantage", !ar.system.properties.includes("stealthDisadvantage"));
check("featherlight removes the strength requirement", ar.system.strength === 0);
const res = build("shield", "rare", ["of-resistance"]).data;
check("resistance effect", res.effects[0].changes[0].key === "system.traits.dr.value" && res.effects[0].changes[0].mode === 2);

// Fail safe.
const bad = compile(addPick(newRecipe({ seed: "b", rarity: "rare" }), { ...getDef("elemental") }), fixture("chain-mail"), opts);
check("weapon damage on armor fails with no data", bad.data === null && /no attack activity/.test(bad.errors[0]));
const unk = compile({ ...newRecipe({ seed: "u", rarity: "rare" }), picks: [{ id: "nope", seed: "x", params: {} }] }, fixture("longsword"), opts);
check("unknown property fails with no data", unk.data === null && unk.errors.length === 1);
const badKey = compile(newRecipe({ seed: "k", rarity: "rare" }), fixture("longsword"), {
  getDef: () => ({ id: "evil", slot: "suffix", cost: 0, appliesTo: ["weapon"], changes: [{ type: "effect", changes: [{ key: "ownership.default", mode: "override", value: 3 }] }] }),
  getTranslator,
});
check("compiling with no picks works", badKey.data !== null);
const evil = compile({ ...newRecipe({ seed: "k", rarity: "rare" }), picks: [{ id: "evil", seed: "s", params: {} }] }, fixture("longsword"), {
  getDef: () => ({ id: "evil", slot: "suffix", cost: 0, appliesTo: ["weapon"], changes: [{ type: "effect", changes: [{ key: "ownership.default", mode: "override", value: 3 }] }] }),
  getTranslator,
});
check("effect keys outside the allowlist are refused", evil.data === null && /not allowed/.test(evil.errors[0]));
