// Base-item sources: the setting, the GM-only form, and the builder's random buttons.
import { install, writes, notes, addPack, settings, uuids, MockItem } from "./foundry-mock.mjs";
import { check } from "./check.mjs";
import { fixture } from "./load-node.mjs";

install({ isGM: true });
const { loadAll } = await import("./load-node.mjs");
loadAll();
const { registerSettings, chosenBasePackIds, PmiSourcesConfig } = await import("../scripts/settings.mjs");
const { PmiBuilder } = await import("../scripts/apps/builder.mjs");

let invalidated = 0;
registerSettings(() => invalidated++);
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
const form = new PmiSourcesConfig();
const ctx = await form._prepareContext();
check("form lists only compendiums with mundane bases", JSON.stringify(ctx.packs.map((p) => p.id).sort()) === JSON.stringify(["dnd5e.equipment24", "dnd5e.items", "phb.equipment"]));
check("form counts usable bases (magical ones excluded)", ctx.packs.find((p) => p.id === "dnd5e.items").count === 2);
check("form ticks the current choice", ctx.packs.filter((p) => p.checked).length === 2);

// Submitting saves only real compendium ids, and only for a GM.
const fakeForm = (ids) => ({ querySelectorAll: () => ids.map((value) => ({ value })) });
const submit = PmiSourcesConfig.DEFAULT_OPTIONS.form.handler;
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
