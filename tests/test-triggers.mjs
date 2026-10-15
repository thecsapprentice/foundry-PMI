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
function makeItem({ triggers, pmi = true, owner = true, spent = 0 } = {}) {
  const item = {
    name: "Emberfang", uuid: "Item.ember", isOwner: owner, actor: { name: "Hero" },
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
