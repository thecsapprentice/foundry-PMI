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

// Self-aimed damage (Spined, Treacherous): the card and its damage roll target the wielder, not the enemy.
const calls = [];
const spineAct = {
  type: "damage", target: { affects: { type: "self" } },
  use: async (...a) => { calls.push(["use", a]); return { message: { id: "msg1" } }; },
  rollDamage: async (...a) => { calls.push(["rollDamage", a]); },
};
const wielder = { uuid: "Actor.hero", name: "Hero", img: "hero.png", system: { attributes: { ac: { value: 16 } } }, getActiveTokens: () => [{ name: "Hero (token)" }] };
const spined = makeItem({ triggers: [{ on: "hit", activity: "spine" }] });
spined.actor = wielder;
spined.system.activities.set("spine", spineAct);
await T.onDamageRoll([{}], { subject: { type: "attack", item: spined } });
const [useCall, rollCall] = calls;
const self = [{ name: "Hero (token)", img: "hero.png", uuid: "Actor.hero", ac: 16 }];
check("the self-damage card targets the wielder", useCall?.[0] === "use" && JSON.stringify(useCall[1][2].data["flags.dnd5e.targets"]) === JSON.stringify(self));
check("…without its usual automatic roll (which would target the enemy)", useCall[1][0].subsequentActions === false && useCall[1][1].configure === false);
check("PMI rolls the damage itself, aimed at the wielder, with no dialog", rollCall?.[0] === "rollDamage"
  && JSON.stringify(rollCall[1][2].data["flags.dnd5e.targets"]) === JSON.stringify(self)
  && rollCall[1][2].data["flags.dnd5e.originatingMessage"] === "msg1" && rollCall[1][1].configure === false);
calls.length = 0;
spineAct.use = async () => undefined;
await T.onDamageRoll([{}], { subject: { type: "attack", item: spined } });
check("if the card isn't posted, no damage is rolled", calls.length === 0);
uses.length = 0;
await T.fire(makeItem({ triggers: [] }), [{ on: "crit", activity: "act1" }], 1);
check("other activities are used the usual way", uses.length === 1 && uses[0][1][1]?.configure === false);

// Hits seen through the damage roll's chat message (for roll-automation modules that skip dnd5e's hook),
// fired once even when both the message and the hook arrive.
game.user = { id: "me" };
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
