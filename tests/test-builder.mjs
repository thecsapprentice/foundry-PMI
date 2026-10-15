// The builder's world writes, against mocked Foundry globals.
import { install, writes, notes, folders, uuids, MockItem } from "./foundry-mock.mjs";
import { check } from "./check.mjs";
import { fixture } from "./load-node.mjs";

install({ isGM: true });
const { loadAll } = await import("./load-node.mjs");
loadAll();
const { PmiBuilder } = await import("../scripts/apps/builder.mjs");
const { addPick, newRecipe } = await import("../scripts/generator/roller.mjs");
const { getProperty } = await import("../scripts/api.mjs");
const A = PmiBuilder.DEFAULT_OPTIONS.actions;

uuids.set("Compendium.dnd5e.items.Item.longsword", new MockItem(fixture("longsword")));
const magic = fixture("longsword"); magic.system.magicalBonus = 1; magic.system.properties.push("mgc");
uuids.set("Compendium.dnd5e.items.Item.magic", new MockItem(magic));

// Players can't open it.
game.user.isGM = false;
check("players can't open the builder", (await PmiBuilder.open()) === null && notes.at(-1)[1] === "PMI.Builder.GMOnly");
game.user.isGM = true;

// Rolling with no base does nothing.
const app = await PmiBuilder.open();
A.roll.call(app);
check("rolling without a base warns", notes.at(-1)[1] === "PMI.Builder.ChooseBase" && app.recipe.picks.length === 0);
await A.create.call(app);
check("creating without a base writes nothing", writes.length === 0);

// A base but no properties: nothing to create.
await PmiBuilder.open(new MockItem({ name: "x", flags: { "foundry-pmi": { recipe: newRecipe({ seed: "e", rarity: "rare", baseUuid: "Compendium.dnd5e.items.Item.longsword" }) } } }));
await A.create.call(app);
check("an item with no properties can't be created", writes.length === 0);

// Rarity buttons.
A.setRarity.call(app, null, { dataset: { rarity: "legendary" } });
check("rarity button sets the rarity", app.recipe.rarity === "legendary");
A.setRarity.call(app, null, { dataset: { rarity: "mythic" } });
check("an unknown rarity is ignored", app.recipe.rarity === "legendary");

// Open from a PMI item: loads a copy of its recipe and its base.
let recipe = addPick(addPick(newRecipe({ seed: "test-seed", rarity: "rare", baseUuid: "Compendium.dnd5e.items.Item.longsword" }), getProperty("elemental")), getProperty("weapon-plus-1"));
const pmiItem = new MockItem({ name: "x", flags: { "foundry-pmi": { recipe } } });
await PmiBuilder.open(pmiItem);
app.recipe.rarity = "veryRare";
check("builder edits a copy, not the item's flag", pmiItem.flags["foundry-pmi"].recipe.rarity === "rare");
app.recipe.rarity = "rare";

// Validation failure → nothing written.
MockItem.validateThrows = true;
await A.create.call(app);
MockItem.validateThrows = false;
check("failed validation writes nothing", writes.length === 0 && notes.at(-1)[0] === "error");

// Create.
await A.create.call(app);
const folderWrite = writes.find((w) => w.op === "Folder.create");
const itemWrite = writes.find((w) => w.op === "Item.create");
check("creates PMI's folder, marked by flag", folderWrite?.data.flags?.["foundry-pmi"]?.generated === true && folderWrite.data.type === "Item");
check("creates exactly one item", writes.filter((w) => w.op === "Item.create").length === 1);
check("item is hidden from players", itemWrite?.data.ownership?.default === 0);
check("item goes in PMI's folder", itemWrite?.data.folder === folders[0].id);
check("item carries its recipe", itemWrite?.data.flags?.["foundry-pmi"]?.recipe?.picks?.length === 2);
check("item is the compiled weapon", itemWrite?.data.system.magicalBonus === 1 && itemWrite.data.system.rarity === "rare");
check("only Folder.create and Item.create were called", writes.every((w) => ["Folder.create", "Item.create"].includes(w.op)));

// Second create reuses the folder (found by flag).
await A.create.call(app);
check("second create reuses the folder", writes.filter((w) => w.op === "Folder.create").length === 1 && writes.filter((w) => w.op === "Item.create").length === 2);

// A folder with PMI's name but no flag is not reused.
folders.length = 0;
folders.push({ id: "imposter", type: "Item", name: "PMI.Folder.Name", getFlag: () => undefined });
await A.create.call(app);
check("a same-named folder without PMI's flag is ignored", writes.filter((w) => w.op === "Folder.create").length === 2);

// Magical bases are refused.
const magicRecipe = { ...recipe, baseUuid: "Compendium.dnd5e.items.Item.magic" };
await PmiBuilder.open(new MockItem({ flags: { "foundry-pmi": { recipe: magicRecipe } } }));
check("a magical base is refused", notes.at(-1)[1] === "PMI.Builder.BaseMagical");
const before = writes.length;
await A.create.call(app);
check("after a refused base, nothing can be created from the old one", writes.length === before && app.recipe.baseUuid === null);

// Non-PMI items can't be opened.
check("a non-PMI item is refused", (await PmiBuilder.open(new MockItem({ name: "Longsword", flags: {} }))) === null);

// Built-in bases.
const beforeBuiltIn = writes.length;
await PmiBuilder.open(new MockItem({ flags: { "foundry-pmi": { recipe: { ...newRecipe({ seed: "b", rarity: "uncommon", baseUuid: "pmi-base:cloak" }), picks: [{ id: "skilled", seed: "s", locked: false, params: { skill: { value: "ste", name: "Silent", label: "Stealth" } } }] } } } }));
await A.create.call(app);
const cloak = writes.slice(beforeBuiltIn).find((w) => w.op === "Item.create")?.data;
check("creates from a built-in base", cloak?.name === "Silent Cloak" && cloak.system.identifier === "cloak");
check("built-in item is hidden and recorded", cloak?.ownership?.default === 0 && cloak.flags["foundry-pmi"].recipe.baseUuid === "pmi-base:cloak");
await PmiBuilder.open(new MockItem({ flags: { "foundry-pmi": { recipe: { ...newRecipe({ seed: "b", rarity: "uncommon", baseUuid: "pmi-base:nope" }), picks: [] } } } }));
check("an unknown built-in base is refused", notes.at(-1)[1] === "PMI.Builder.BaseMissing" && app.recipe.baseUuid === null);

// Identified / unidentified.
const beforeUnid = writes.length;
await PmiBuilder.open(new MockItem({ flags: { "foundry-pmi": { recipe: { ...newRecipe({ seed: "u", rarity: "uncommon", baseUuid: "pmi-base:cloak" }), picks: [{ id: "skilled", seed: "s", locked: false, params: { skill: { value: "ste", name: "Silent", label: "Stealth" } } }] } } } }));
check("new items start identified", app.recipe.identified !== false);
A.toggleIdentified.call(app);
await A.create.call(app);
const unid = writes.slice(beforeUnid).find((w) => w.op === "Item.create")?.data;
check("toggle creates the item unidentified", unid?.system.identified === false && unid.system.unidentified.name.endsWith("Cloak"));
A.toggleIdentified.call(app);
check("toggling again goes back to identified", app.recipe.identified === true);
