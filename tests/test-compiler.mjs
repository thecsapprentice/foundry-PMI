import { compile } from "../scripts/compiler/index.mjs";
import { damagePart } from "../scripts/compiler/damage.mjs";
import { categorize } from "../scripts/generator/categories.mjs";
import { newRecipe, addPick, roll } from "../scripts/generator/roller.mjs";
import { RARITIES } from "../scripts/config.mjs";
import { loadAll, fixture, spellPool } from "./load-node.mjs";
import { check } from "./check.mjs";

const { properties, getDef, getTranslator, getBase, listBases } = loadAll();
// A base by name: a test fixture (real SRD item) or one of PMI's built-ins ("builtin:ring").
const baseData = (name) => name.startsWith("builtin:") ? getBase(name.slice(8)) : fixture(name);
const opts = { getDef, getTranslator };
const spells = spellPool();
const build = (base, rarity, ids, seed = "test-seed") => {
  let r = newRecipe({ seed, rarity, baseUuid: `Compendium.dnd5e.items.Item.${base}` });
  for (const id of ids) r = addPick(r, getDef(id), { spells });
  return compile(r, baseData(base), opts);
};

check("damagePart simple dice", JSON.stringify(damagePart("2d6", ["fire"])).includes('"number":2,"denomination":6'));
check("damagePart dice + bonus", damagePart("1d8+3").bonus === "3");
check("damagePart custom formula", damagePart("1d4 + @prof").custom.enabled === true);

// Every property compiles on every base it applies to, at every rarity it allows.
const bases = ["longsword", "dagger", "shortbow", "greataxe", "chain-mail", "leather-armor", "shield", "wand", "staff", "rod",
  ...listBases().map((b) => `builtin:${b.id}`)];
let all = true, why = "";
for (const def of properties) {
  for (const base of bases) {
    if (!def.appliesTo.some((c) => categorize(baseData(base)).includes(c))) continue;
    for (const rarity of RARITIES.slice(RARITIES.indexOf(def.minRarity ?? "common"), RARITIES.indexOf(def.maxRarity ?? "artifact") + 1)) {
      // Properties that need another slot filled (Abundant needs a spell) get a level-1 spell first.
      const ids = def.requiresSlot ? ["spell-1", def.id] : [def.id];
      const { data, errors, warnings } = build(base, rarity, ids);
      if (!data || errors.length || warnings.length) { all = false; why = `${def.id} on ${base} at ${rarity}: ${[...errors, ...warnings].join("; ")}`; }
      if (data && /@\w|\{\w+(\.\w+)?\}/.test(JSON.stringify(data).replace(/@UUID\[[^\]]*\]\{[^}]*\}/g, "").replace(/@UUID|@Embed|@scale|@item|@prof|@mod/g, ""))) { all = false; why = `${def.id} on ${base}: unsubstituted variable left in data`; }
    }
  }
}
check("every property compiles everywhere it applies", all, why);

// Random rolls compile.
let rolled = true, rwhy = "";
for (const base of bases) for (const rarity of ["uncommon", "rare", "veryRare", "legendary"]) for (let i = 0; i < 25; i++) {
  const r = roll(newRecipe({ seed: `c${i}`, rarity }), { properties, categories: categorize(baseData(base)), spells });
  const { errors } = compile(r, baseData(base), opts);
  if (errors.length) { rolled = false; rwhy = `${base} ${rarity} c${i}: ${errors.join("; ")}`; }
}
check(`${bases.length * 100} random rolls compile without errors`, rolled, rwhy);

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

// Wands, staves and rods.
const fireball = spells.find((sp) => sp.name === "Fireball");
const pinned = (base, rarity, picks) => compile({ ...newRecipe({ seed: "w", rarity, baseUuid: "x" }), picks }, fixture(base), opts);
const spellPick = (id, sp) => ({ id, seed: `s-${sp.name}`, locked: false, params: { spell: { value: sp.uuid, uuid: sp.uuid, name: sp.name, label: sp.name, level: sp.level, school: sp.school } } });

const wand = pinned("wand", "rare", [spellPick("spell-3", fireball)]).data;
const cast = Object.values(wand.system.activities).find((a) => a.type === "cast");
check("wand is named after its spell", wand.name === "Wand of Fireball", wand.name);
check("wand gets the DMG wand charge pool", wand.system.uses.max === "7" && wand.system.uses.recovery[0].formula === "1d6 + 1" && wand.system.uses.recovery[0].period === "dawn");
check("cast activity links the spell", cast?.spell.uuid === fireball.uuid && cast.spell.level === 3);
check("wand spends 1 charge per cast", cast?.consumption.targets[0].type === "itemUses" && cast.consumption.targets[0].value === "1");
check("extra charges upcast", cast?.consumption.scaling.allowed === true && cast.consumption.targets[0].scaling.mode === "amount" && cast.consumption.scaling.max === "6");
check("fixed DC and attack from rarity", cast?.spell.challenge.override === true && cast.spell.challenge.save === 15 && cast.spell.challenge.attack === 7);
check("no components needed", JSON.stringify(cast?.spell.properties) === '["vocal","somatic","material"]');
check("cast activity has no effects field", cast && !("effects" in cast));
check("spell description links the spell", wand.system.description.value.includes(`@UUID[${fireball.uuid}]{Fireball}`), wand.system.description.value);
check("description states the charge cost", /expend 1 charge to cast/.test(wand.system.description.value));
check("3rd-level spell needs attunement", wand.system.attunement === "required");

const mm = spells.find((sp) => sp.name === "Magic Missile");
const web = spells.find((sp) => sp.name === "Web");
const staffData = pinned("staff", "veryRare", [spellPick("spell-1", mm), spellPick("spell-3", fireball), spellPick("spell-2", web)]).data;
const casts = Object.values(staffData.system.activities).filter((a) => a.type === "cast");
check("staff gets one cast activity per spell", casts.length === 3);
check("staff spells share the staff's pool", staffData.system.uses.max === "10" && staffData.system.uses.recovery[0].formula === "1d6 + 4");
check("staff spends charges equal to spell level", casts.map((c) => c.consumption.targets[0].value).sort().join() === "1,2,3");
check("staff keeps its quarterstaff attack", Object.values(staffData.system.activities).some((a) => a.type === "attack"));
check("staff is named after its first spell", staffData.name === "Staff of Magic Missile", staffData.name);
check("cast activity ids are distinct", new Set(casts.map((c) => c._id)).size === 3);

const ab = pinned("rod", "rare", [spellPick("spell-1", mm), { id: "abundant", seed: "a", locked: false, params: { extra: 3 } }]).data;
check("Abundant adds to the pool even when listed after the spell", ab.system.uses.max === "8");
const ab2 = pinned("rod", "rare", [{ id: "abundant", seed: "a", locked: false, params: { extra: 3 } }, spellPick("spell-1", mm)]).data;
check("Abundant adds to the pool when listed before the spell", ab2.system.uses.max === "8");
const abNone = pinned("rod", "rare", [{ id: "abundant", seed: "a", locked: false, params: { extra: 3 } }]);
check("Abundant alone fails safely", abNone.data === null && /no charges/.test(abNone.errors[0]));

const thunderStaff = pinned("staff", "rare", [{ id: "of-thunder", seed: "t", locked: false, params: { damage: "2d8" } }, spellPick("spell-1", mm)]).data;
check("a weapon charge property and spells share one pool", thunderStaff.system.uses.max === "3" && Object.values(thunderStaff.system.activities).filter((a) => a.type === "cast").length === 1);

const badSpell = pinned("wand", "rare", [{ ...spellPick("spell-3", fireball), params: { spell: { value: "not-a-uuid", uuid: "not-a-uuid", name: "X", level: 3 } } }]);
check("a malformed spell UUID fails safely", badSpell.data === null && /UUID/.test(badSpell.errors[0]));

// Worn items on PMI's built-in bases.
check("ten built-in bases", listBases().length === 10);
for (const b of listBases()) check(`built-in ${b.id} is a usable mundane base`, categorize(getBase(b.id)).length > 0);
check("built-in bases are copies", (getBase("ring").name = "X", getBase("ring").name === "Ring"));

const pinnedB = (base, rarity, picks) => compile({ ...newRecipe({ seed: "wb", rarity, baseUuid: `pmi-base:${base}` }), picks }, getBase(base), opts);
const silent = pinnedB("cloak", "uncommon", [{ id: "skilled", seed: "s", locked: false, params: { skill: { value: "ste", name: "Silent", label: "Stealth" } } }]).data;
check("skill advantage effect", silent.effects[0].changes[0].key === "system.skills.ste.roll.mode" && silent.effects[0].changes[0].mode === 2 && silent.effects[0].changes[0].value === "1");
check("worn item is named prefix + base", silent.name === "Silent Cloak", silent.name);
check("worn item keeps its equipment type", silent.type === "equipment" && silent.system.type.value === "clothing");

const boots = pinnedB("boots", "rare", [{ id: "winged", seed: "w", locked: false, params: { speed: 60 } }]).data;
const fly = Object.values(boots.system.activities).find((a) => a.type === "utility");
const flyFx = boots.effects.find((e) => e._id === fly?.effects[0]?._id);
check("activated power is a utility activity", !!fly && fly.activation.type === "bonus");
check("once per day, regained at dawn", fly?.uses.max === "1" && fly.uses.recovery[0].period === "dawn" && fly.consumption.targets[0].type === "activityUses");
check("activity applies the item's own effect", !!flyFx && flyFx.transfer === false);
check("effect lasts 10 minutes", flyFx?.duration.seconds === 600);
check("effect grants the flying speed", flyFx?.changes[0].key === "system.attributes.movement.fly" && flyFx.changes[0].value === "60" && flyFx.changes[0].mode === 4);
check("activity targets self", fly?.target.affects.type === "self" && fly.range.units === "self");
check("no charge pool for a per-day power", !boots.system.uses?.max);

const ring = pinnedB("ring", "rare", [{ id: "vanishing", seed: "v", locked: false, params: {} }]).data;
const vfx = ring.effects[0];
check("status-only power: invisible for 1 minute", JSON.stringify(vfx.statuses) === '["invisible"]' && vfx.changes.length === 0 && vfx.duration.seconds === 60);

const belt = pinnedB("belt", "veryRare", [{ id: "ability-score", seed: "a", locked: false, params: { ability: { value: "str", name: "Might", label: "Strength" }, score: 23 } }]).data;
check("ability score raised, never lowered (upgrade)", belt.effects[0].changes[0].key === "system.abilities.str.value" && belt.effects[0].changes[0].mode === 4 && belt.effects[0].changes[0].value === "23");
check("ability-score item needs attunement", belt.system.attunement === "required");
check("belt named after its suffix", belt.name === "Belt of Might", belt.name);

const amulet = pinnedB("amulet", "rare", [spellPick("spell-3", fireball)]).data;
const acast = Object.values(amulet.system.activities).find((a) => a.type === "cast");
check("amulet with a spell gets a worn charge pool", amulet.system.uses.max === "3" && amulet.system.uses.recovery[0].formula === "1d3");
check("worn items spend 1 charge per spell", acast?.consumption.targets[0].value === "1");
check("amulet named after its spell", amulet.name === "Amulet of Fireball", amulet.name);

const prot = pinnedB("ring", "veryRare", [{ id: "of-protection", seed: "p", locked: false, params: { bonus: 2 } }]).data;
check("of Protection scales with rarity", prot.effects[0].changes.every((c) => c.value === "+2"));

const bw = pinnedB("wand", "rare", [spellPick("spell-3", fireball)]).data;
check("built-in wand works like the SRD wand", bw.system.uses.max === "7" && bw.name === "Wand of Fireball");
