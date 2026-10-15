// Base-item sources: the setting, the GM-only form, and the builder's random buttons.
import { install, writes, notes, addPack, settings, uuids, MockItem } from "./foundry-mock.mjs";
import { check } from "./check.mjs";
import { fixture } from "./load-node.mjs";

install({ isGM: true });
const { loadAll } = await import("./load-node.mjs");
loadAll();
const { registerSettings, chosenBasePackIds, chosenSpellPackIds, PmiBaseSourcesConfig, PmiSpellSourcesConfig, loadSpellPool } = await import("../scripts/settings.mjs");
const { PmiBuilder } = await import("../scripts/apps/builder.mjs");

let invalidated = 0;
let spellsInvalidated = 0;
registerSettings({ onBasePacksChange: () => invalidated++, onSpellPacksChange: () => spellsInvalidated++ });
check("defaults to the dnd5e compendiums", JSON.stringify(chosenBasePackIds()) === JSON.stringify(["dnd5e.items", "dnd5e.equipment24"]));

const ls = { ...fixture("longsword"), _id: "ls" }, cm = { ...fixture("chain-mail"), _id: "cm" }, sh = { ...fixture("shield"), _id: "sh" };
const magic = { ...fixture("longsword"), _id: "mg", system: { ...fixture("longsword").system, magicalBonus: 1 } };
addPack("dnd5e.items", [ls, cm, magic]);
addPack("dnd5e.equipment24", [sh]);
addPack("phb.equipment", [{ ...ls, _id: "ls2" }], { packageName: "phb", packageType: "module" });
addPack("dnd5e.spells", [{ _id: "sp", name: "Fireball", type: "spell", system: {} }]);
for (const [id, d] of [["dnd5e.items", ls], ["dnd5e.items", cm], ["dnd5e.equipment24", sh]])
  uuids.set(`Compendium.${id}.Item.${d._id}`, new MockItem(d));

// The form lists only compendiums with usable bases, with counts.
const form = new PmiBaseSourcesConfig();
const ctx = await form._prepareContext();
check("form lists only compendiums with mundane bases", JSON.stringify(ctx.packs.map((p) => p.id).sort()) === JSON.stringify(["dnd5e.equipment24", "dnd5e.items", "phb.equipment"]));
check("form counts usable bases (magical ones excluded)", ctx.packs.find((p) => p.id === "dnd5e.items").count === 2);
check("form ticks the current choice", ctx.packs.filter((p) => p.checked).length === 2);

// Submitting saves only real compendium ids, and only for a GM.
const fakeForm = (ids) => ({ querySelectorAll: () => ids.map((value) => ({ value })) });
// Foundry merges DEFAULT_OPTIONS down the class chain; the form handler is defined on the shared parent.
const submit = Object.getPrototypeOf(PmiBaseSourcesConfig).DEFAULT_OPTIONS.form.handler;
game.user.isGM = false;
await submit.call(form, null, fakeForm(["phb.equipment"]));
check("players can't change the sources", writes.length === 0);
game.user.isGM = true;
await submit.call(form, null, fakeForm(["phb.equipment", "not.a.pack"]));
check("GM save writes only the basePacks setting", writes.length === 1 && writes[0].op === "settings.set" && writes[0].key === "foundry-pmi.basePacks");
check("unknown compendium ids are dropped", JSON.stringify(writes[0].value) === '["phb.equipment"]');
check("saving refreshes the builder's list", invalidated === 1);
check("the builder now uses the saved choice", JSON.stringify(chosenBasePackIds()) === '["phb.equipment"]');

// Random buttons in the builder.
await game.settings.set("foundry-pmi", "basePacks", ["dnd5e.items", "dnd5e.equipment24"]);
writes.length = 0;
const app = await PmiBuilder.open();
PmiBuilder.invalidateBases();
const A = PmiBuilder.DEFAULT_OPTIONS.actions;
await A.randomBase.call(app, null, { dataset: { kind: "shield" } });
check("random shield picks the shield", app.recipe.baseUuid === "Compendium.dnd5e.equipment24.Item.sh");
await A.randomBase.call(app, null, { dataset: { kind: "weapon" } });
check("random weapon picks the longsword (never the magical one)", app.recipe.baseUuid === "Compendium.dnd5e.items.Item.ls");
await game.settings.set("foundry-pmi", "basePacks", ["dnd5e.items"]);
PmiBuilder.invalidateBases(); // main.mjs passes this as the setting's onChange
await A.randomBase.call(app, null, { dataset: { kind: "shield" } });
check("no shield in the sources warns and keeps the base", notes.at(-1)[1] === "PMI.Builder.NoBaseOfKind.shield" && app.recipe.baseUuid === "Compendium.dnd5e.items.Item.ls");
const before = app.recipe.rarity;
A.randomRarity.call(app);
check("random rarity changes the rarity", app.recipe.rarity !== before && ["uncommon", "rare", "veryRare", "legendary"].includes(app.recipe.rarity));
check("random buttons write nothing to the world", writes.every((w) => w.op === "settings.set"));

// Spell sources.
check("spell sources default to the dnd5e spell compendiums", JSON.stringify(chosenSpellPackIds()) === JSON.stringify(["dnd5e.spells", "dnd5e.spells24"]));
const fb = { _id: "fireball00000000", name: "Fireball", type: "spell", system: { level: 3, school: "evo", properties: ["vocal", "somatic", "material"], activation: { type: "action" } } };
const web = { _id: "web0000000000000", name: "Web", type: "spell", system: { level: 2, school: "con", properties: ["concentration"], activation: { type: "action" } } };
const phbFb = { ...fb, _id: "phbfireball00000" };
addPack("dnd5e.spells", [fb, web]);
addPack("phb.spells", [phbFb], { packageName: "phb", packageType: "module" });
globalThis.dnd5e = { registry: { spellLists: { forSpell: (uuid) => uuid.endsWith("fireball00000000") ? new Set([{ metadata: { type: "class", identifier: "wizard" } }, { metadata: { type: "subclass", identifier: "x" } }]) : new Set() } } };

const sform = new PmiSpellSourcesConfig();
const sctx = await sform._prepareContext();
check("spell form lists only compendiums with spells", JSON.stringify(sctx.packs.map((p) => p.id).sort()) === JSON.stringify(["dnd5e.spells", "phb.spells"]));
check("spell form counts spells", sctx.packs.find((p) => p.id === "dnd5e.spells").count === 2);
let pool = await loadSpellPool();
const pfb = pool.find((sp) => sp.name === "Fireball");
check("spell pool summarises spells", pool.length === 2 && pfb.level === 3 && pfb.school === "evo" && pfb.activation === "action");
check("spell pool reads class lists (classes only)", JSON.stringify(pfb.classes) === '["wizard"]');
check("spell pool flags concentration", pool.find((sp) => sp.name === "Web").concentration === true);
writes.length = 0;
await submit.call(sform, null, fakeForm(["phb.spells"]));
check("saving spell sources writes only the spellPacks setting", writes.length === 1 && writes[0].key === "foundry-pmi.spellPacks");
check("saving spell sources refreshes the builder's spells", spellsInvalidated === 1);
pool = await loadSpellPool();
check("spell pool follows the setting", pool.length === 1 && pool[0].uuid === "Compendium.phb.spells.Item.phbfireball00000");
delete globalThis.dnd5e;
check("spell pool works without the spell list registry", (await loadSpellPool())[0].classes.length === 0);

// The builder refuses to create an item whose spell can't be found.
const { newRecipe } = await import("../scripts/generator/roller.mjs");
uuids.set("Compendium.dnd5e.items.Item.wand", new MockItem({ ...fixture("wand"), _id: "wand" }));
const gone = { id: "spell-3", seed: "s", locked: false, params: { spell: { value: "Compendium.dnd5e.spells.Item.gone000000000000", uuid: "Compendium.dnd5e.spells.Item.gone000000000000", name: "Vanished", level: 3 } } };
await PmiBuilder.open(new MockItem({ flags: { "foundry-pmi": { recipe: { ...newRecipe({ seed: "g", rarity: "rare", baseUuid: "Compendium.dnd5e.items.Item.wand" }), picks: [gone] } } } }));
writes.length = 0;
await A.create.call(app);
check("a missing spell stops creation", writes.length === 0 && notes.at(-1)[0] === "error" && /Vanished/.test(notes.at(-1)[1]));
uuids.set(gone.params.spell.uuid, new MockItem({ name: "Vanished", type: "spell" }));
await A.create.call(app);
const made = writes.find((w) => w.op === "Item.create")?.data;
check("with the spell present, the wand is created", Object.values(made?.system.activities ?? {}).some((a) => a.type === "cast"));
check("a rare wand gets a true name, with its full name in the description", made?.name !== "Wand of Vanished" && made.system.description.value.includes("<strong>Wand of Vanished</strong>"));
check("the wand is hidden from players", made?.ownership?.default === 0);
