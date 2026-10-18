// Tier 3 runtime, against mocked Foundry objects.
import { install, writes } from "./foundry-mock.mjs";
import { check } from "./check.mjs";

install({ isGM: true });
const registered = [];
globalThis.libWrapper = { register: (...args) => registered.push(args) };
game.modules.get = (id) => (id === "lib-wrapper" ? { active: true } : null);
const hooks = [];
globalThis.Hooks = { on: (name, fn) => hooks.push([name, fn]) };
globalThis.ChatMessage = { implementation: {
  create: async (data) => { writes.push({ op: "ChatMessage.create", data }); return data; },
  getSpeaker: ({ actor }) => ({ alias: actor?.name }),
} };
game.i18n.format = (k, d) => `${k} ${JSON.stringify(d)}`;

const T = await import("../scripts/runtime/triggers.mjs");
T.registerTriggers();
check("hooks registered", ["dnd5e.rollAttackV2", "dnd5e.preApplyDamage", "dnd5e.applyDamage"].every((h) => hooks.some(([n]) => n === h)));
check("one WRAPPER on the apply-damage button", registered.length === 1 && registered[0][1] === "dnd5e.applications.components.DamageApplicationElement.prototype._onApplyDamage" && registered[0][3] === "WRAPPER");

const uses = [];
let itemCount = 0;
function makeItem({ triggers, pmi = true, owner = true, spent = 0 } = {}) {
  const item = {
    name: "Emberfang", uuid: `Item.ember${++itemCount}`, isOwner: owner, actor: { name: "Hero" },
    flags: pmi ? { "foundry-pmi": { recipe: { picks: [] }, triggers } } : {},
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    system: { uses: { max: "3", spent }, activities: new Map([["act1", { use: async (...a) => uses.push(["act1", a]) }]]) },
    async update(u) { writes.push({ op: "Item.update", data: u }); if ("system.uses.spent" in u) this.system.uses.spent = u["system.uses.spent"]; },
  };
  return item;
}

// Crits.
const crit = makeItem({ triggers: [{ on: "crit", activity: "act1" }] });
await T.onAttackRoll([{ isCritical: true }], { subject: { item: crit } });
check("a critical hit uses the trigger's activity", uses.length === 1 && uses[0][1][1]?.configure === false);
await T.onAttackRoll([{ isCritical: false }], { subject: { item: crit } });
check("a normal hit does nothing", uses.length === 1);
await T.onAttackRoll([{ isCritical: true }], { subject: { item: makeItem({ triggers: [{ on: "crit", activity: "act1" }], pmi: false }) } });
check("non-PMI items are ignored", uses.length === 1);
await T.onAttackRoll([{ isCritical: true }], { subject: { item: makeItem({ triggers: [{ on: "kill", activity: "act1" }] }) } });
check("kill triggers don't fire on crits", uses.length === 1);
await T.onAttackRoll([{ isCritical: true }], { subject: null });
check("rolls without an item are ignored", uses.length === 1);

// Kills via the wrapped apply button.
const victim = (hp) => ({ uuid: `Actor.${Math.random()}`, system: { attributes: { hp: { value: hp } } } });
const applyWith = async (item, targets) => {
  const tray = { chatMessage: { getAssociatedItem: () => item } };
  let calledWith = null;
  const wrapped = async (...args) => {
    calledWith = args;
    for (const [actor, dmg] of targets) {
      T.onPreApplyDamage(actor);
      actor.system.attributes.hp.value = Math.max(0, actor.system.attributes.hp.value - dmg);
      T.onApplyDamage(actor);
    }
    return "done";
  };
  const result = await T.wrapApplyDamage.call(tray, wrapped, "evt");
  return { result, calledWith };
};
uses.length = 0;
const reaper = makeItem({ triggers: [{ on: "kill", activity: "act1" }] });
let r = await applyWith(reaper, [[victim(5), 10]]);
check("the wrapper passes the call through unchanged", r.result === "done" && r.calledWith[0] === "evt");
check("a kill uses the trigger's activity", uses.length === 1);
await applyWith(reaper, [[victim(20), 5]]);
check("damage that doesn't kill does nothing", uses.length === 1);
await applyWith(reaper, [[victim(0), 5]]);
check("hitting a creature already at 0 isn't a kill", uses.length === 1);
await applyWith(reaper, [[victim(3), 9], [victim(4), 9]]);
check("two kills fire twice", uses.length === 3);
const plain = makeItem({ triggers: [{ on: "kill", activity: "act1" }], pmi: false });
r = await applyWith(plain, [[victim(3), 9]]);
check("non-PMI damage passes straight through", r.result === "done" && uses.length === 3);
await applyWith(null, [[victim(3), 9]]);
check("messages without an item pass straight through", uses.length === 3);

// Restoring charges on a kill: the only direct write, and only to the PMI item itself.
writes.length = 0;
const hungry = makeItem({ triggers: [{ on: "kill", restoreCharges: 1 }], spent: 2 });
await applyWith(hungry, [[victim(1), 5]]);
check("a kill restores a charge", hungry.system.uses.spent === 1);
check("it writes only the item's charges and a chat message", writes.length === 2 && JSON.stringify(writes[0].data) === '{"system.uses.spent":1}' && writes[1].op === "ChatMessage.create");
writes.length = 0;
const full = makeItem({ triggers: [{ on: "kill", restoreCharges: 1 }], spent: 0 });
await applyWith(full, [[victim(1), 5]]);
check("a full item writes nothing", writes.length === 0);

// Permissions and missing data.
uses.length = 0;
await T.fire(makeItem({ triggers: [], owner: false }), [{ on: "kill", activity: "act1" }], 1);
check("users who don't own the item trigger nothing", uses.length === 0);
const warn = console.warn; let warned = false; console.warn = () => { warned = true; };
await T.fire(makeItem({ triggers: [] }), [{ on: "kill", activity: "gone" }], 1);
console.warn = warn;
check("a missing activity is skipped with a warning", warned && uses.length === 0);

// Fumbles, hits and dawn.
check("damage and rest hooks registered", ["dnd5e.rollDamageV2", "dnd5e.restCompleted"].every((h) => hooks.some(([n]) => n === h)));
uses.length = 0;
const clumsy = makeItem({ triggers: [{ on: "fumble", activity: "act1" }] });
await T.onAttackRoll([{ isFumble: false }], { subject: { item: clumsy } });
check("a normal attack roll doesn't fire a fumble trigger", uses.length === 0);
await T.onAttackRoll([{ isFumble: true }], { subject: { item: clumsy } });
check("a natural 1 fires the fumble trigger", uses.length === 1);
await T.onAttackRoll([{ isCritical: true }], { subject: { item: clumsy } });
check("a crit doesn't fire the fumble trigger", uses.length === 1);

const spiny = makeItem({ triggers: [{ on: "hit", activity: "act1" }] });
await T.onDamageRoll([{}], { subject: { type: "attack", item: spiny } });
check("damage from the item's attack fires the hit trigger", uses.length === 2);
await T.onDamageRoll([{}], { subject: { type: "damage", item: spiny } });
await T.onDamageRoll([{}], { subject: { type: "save", item: spiny } });
check("other damage from the item (its own spine card, a save) doesn't", uses.length === 2);
await T.onDamageRoll([{}], { subject: { type: "attack", item: makeItem({ triggers: [{ on: "hit", activity: "act1" }], pmi: false }) } });
await T.onDamageRoll([{}], {});
await T.onDamageRoll([{}], undefined);
check("non-PMI items and enricher rolls are ignored", uses.length === 2);

const sulky = makeItem({ triggers: [{ on: "dawn", activity: "act1" }] });
const other = makeItem({ triggers: [{ on: "dawn", activity: "act1" }], pmi: false });
const actor = { items: [sulky, other, makeItem({ triggers: [{ on: "hit", activity: "act1" }] })] };
await T.onRestCompleted(actor, { newDay: false });
check("a short rest isn't dawn", uses.length === 2);
await T.onRestCompleted(actor, { newDay: true });
check("a rest into a new day fires the dawn trigger once, for PMI items only", uses.length === 3);
await T.onRestCompleted(null, { newDay: true });
await T.onRestCompleted({}, undefined);
check("rests without an actor or result do nothing", uses.length === 3);
const notMine = makeItem({ triggers: [{ on: "dawn", activity: "act1" }], owner: false });
await T.onRestCompleted({ items: [notMine] }, { newDay: true });
check("dawn triggers fire only for the item's owner", uses.length === 3);

// Self-aimed damage (Spined, Treacherous): one damage card aimed at the wielder; no usage card; targets kept.
const calls = [];
const spineAct = {
  type: "damage", name: "Spines Bite", target: { affects: { type: "self" } }, consumption: { targets: [] }, uses: { max: "" },
  use: async (...a) => { calls.push(["use", a]); return { message: { id: "msg1" } }; },
  rollDamage: async (...a) => { calls.push(["rollDamage", a]); game.user.targets = new Set([{ id: "heroToken" }]); return [{}]; },
};
const wielder = { uuid: "Actor.hero", name: "Hero", img: "hero.png", system: { attributes: { ac: { value: 16 } } }, getActiveTokens: () => [{ name: "Hero (token)" }] };
const spined = makeItem({ triggers: [{ on: "hit", activity: "spine" }] });
spined.actor = wielder;
spined.system.activities.set("spine", spineAct);
let restored = null;
game.user = { id: "me", targets: new Set([{ id: "goblin" }]), updateTokenTargets: (ids) => { restored = ids; } };
await T.onDamageRoll([{ formula: "1d8", total: 5 }], { subject: { type: "attack", item: spined } });
const self = [{ name: "Hero (token)", img: "hero.png", uuid: "Actor.hero", ac: 16 }];
check("no usage card: the item's description isn't posted again", !calls.some(([k]) => k === "use"));
const rollCall = calls.find(([k]) => k === "rollDamage");
check("one damage card, aimed at the wielder, with no dialog", calls.length === 1 && rollCall
  && JSON.stringify(rollCall[1][2].data["flags.dnd5e.targets"]) === JSON.stringify(self) && rollCall[1][1].configure === false);
check("…flavoured with the item and the drawback", rollCall[1][2].data.flavor === "Emberfang: Spines Bite");
check("the player's own target (the enemy) is put back if something changed it", JSON.stringify(restored) === '["goblin"]');
restored = null;
calls.length = 0;
spineAct.rollDamage = async (...a) => { calls.push(["rollDamage", a]); return [{}]; };
await T.onDamageRoll([{ formula: "1d8", total: 6 }], { subject: { type: "attack", item: spined } });
check("targets nobody changed are left alone", restored === null && calls.length === 1);
calls.length = 0;
spineAct.consumption = { targets: [{ type: "itemUses" }] };
await T.onDamageRoll([{ formula: "1d8", total: 7 }], { subject: { type: "attack", item: spined } });
check("self-damage that spends charges goes through dnd5e's use, then one roll at the wielder",
  calls.length === 2 && calls[0][0] === "use" && calls[0][1][0].subsequentActions === false
  && JSON.stringify(calls[0][1][2].data["flags.dnd5e.targets"]) === JSON.stringify(self)
  && JSON.stringify(calls[1][1][2].data["flags.dnd5e.targets"]) === JSON.stringify(self));

// Healing and boosts aimed at the wielder (Bloodthirsty / Gore-Drinking, Reaping, Exultant) on a crit or kill.
calls.length = 0;
const healAct = {
  type: "heal", name: "Blood Rush", target: { affects: { type: "self" } }, consumption: { targets: [] }, uses: { max: "" },
  use: async (...a) => { calls.push(["use", a]); return { message: { id: "m" } }; },
  rollDamage: async (...a) => { calls.push(["rollDamage", a]); game.user.targets = new Set([{ id: "heroToken" }]); return [{}]; },
};
const gore = makeItem({ triggers: [{ on: "crit", activity: "heal" }] });
gore.actor = wielder;
gore.system.activities.set("heal", healAct);
restored = null;
game.user = { id: "me", targets: new Set([{ id: "goblin" }]), updateTokenTargets: (ids) => { restored = ids; } };
await T.onAttackRoll([{ isCritical: true }], { subject: { item: gore } });
check("Gore-Drinking's healing is one card aimed at the wielder", calls.length === 1 && calls[0][0] === "rollDamage"
  && JSON.stringify(calls[0][1][2].data["flags.dnd5e.targets"]) === JSON.stringify(self));
check("…and the crit's target stays on the enemy for the damage roll", JSON.stringify(restored) === '["goblin"]');

calls.length = 0;
const boostAct = { type: "utility", name: "Exultation", target: { affects: { type: "self" } },
  use: async (...a) => { calls.push(["use", a]); return { message: { id: "m2" } }; } };
const exult = makeItem({ triggers: [{ on: "crit", activity: "boost" }] });
exult.actor = wielder;
exult.system.activities.set("boost", boostAct);
game.user.targets = new Set([{ id: "goblin" }]);
await T.onAttackRoll([{ isCritical: true }], { subject: { item: exult } });
check("a self boost posts its card aimed at the wielder", calls.length === 1 && calls[0][0] === "use"
  && JSON.stringify(calls[0][1][2].data["flags.dnd5e.targets"]) === JSON.stringify(self));

// A module that retargets the wielder a moment later is undone; a player's own new target is not.
const { restoreTargets } = T;
restored = null;
game.user.targets = new Set([{ id: "goblin" }]);
wielder.getActiveTokens = () => [{ id: "heroToken", name: "Hero (token)" }];
restoreTargets(["goblin"], wielder, { delay: 20 });
game.user.targets = new Set([{ id: "heroToken" }]); // an auto-target module, just after
await new Promise((r) => setTimeout(r, 40));
check("a late auto-target onto the wielder is undone", JSON.stringify(restored) === '["goblin"]');
restored = null;
game.user.targets = new Set([{ id: "goblin" }]);
restoreTargets(["goblin"], wielder, { delay: 20 });
game.user.targets = new Set([{ id: "orc" }]); // the player picks a new enemy
await new Promise((r) => setTimeout(r, 40));
check("a player's own new target is never overruled", restored === null);
uses.length = 0;
await T.fire(makeItem({ triggers: [] }), [{ on: "crit", activity: "act1" }], 1);
check("other activities are used the usual way", uses.length === 1 && uses[0][1][1]?.configure === false);

// Hits seen through the damage roll's chat message (for roll-automation modules that skip dnd5e's hook),
// fired once even when both the message and the hook arrive.
game.user = { id: "me", targets: new Set() };
uses.length = 0;
const msgItem = makeItem({ triggers: [{ on: "hit", activity: "act1" }] });
const damageMsg = (item, { roll = "damage", act = "attack", total = 7 } = {}) => ({
  rolls: [{ formula: "1d8+3", total }],
  getFlag: (scope, key) => ({ "roll.type": roll, "activity.type": act })[key],
  getAssociatedItem: () => item,
});
let m = damageMsg(msgItem, { total: 7 });
await T.onChatMessage(m, {}, "someone-else");
check("other users' damage messages are ignored", uses.length === 0);
await T.onChatMessage(m, {}, "me");
check("my attack's damage message fires the hit trigger", uses.length === 1);
await T.onDamageRoll(m.rolls, { subject: { type: "attack", item: msgItem } });
check("…and dnd5e's hook for the same roll doesn't fire it again", uses.length === 1);
m = damageMsg(msgItem, { total: 9 });
await T.onDamageRoll(m.rolls, { subject: { type: "attack", item: msgItem } });
await T.onChatMessage(m, {}, "me");
check("a second hit fires once more, whichever arrives first", uses.length === 2);
await T.onChatMessage(damageMsg(msgItem, { act: "damage", total: 3 }), {}, "me");
await T.onChatMessage(damageMsg(msgItem, { roll: "attack", total: 4 }), {}, "me");
await T.onChatMessage(damageMsg(makeItem({ triggers: [{ on: "hit", activity: "act1" }], pmi: false }), { total: 5 }), {}, "me");
check("self-damage cards, attack rolls and non-PMI items don't count as hits", uses.length === 2);
check("the same roll is claimed once", T.claimHit({ uuid: "X" }, [{ formula: "1d4", total: 2 }], 1000) && !T.claimHit({ uuid: "X" }, [{ formula: "1d4", total: 2 }], 2000));
check("…but can count again later", T.claimHit({ uuid: "X" }, [{ formula: "1d4", total: 2 }], 9000));
check("the chat-message hook is registered", hooks.some(([n]) => n === "createChatMessage"));
