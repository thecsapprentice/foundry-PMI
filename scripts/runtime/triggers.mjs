// Tier 3 triggers: things a PMI item does by itself when something happens in play.
//
//   crit  dnd5e announces every attack roll (dnd5e.rollAttackV2). When a PMI item with a "crit" trigger
//         rolls a critical hit, PMI uses the trigger's activity, on the client that rolled.
//   kill  dnd5e doesn't say where damage came from, but its "apply damage" tray belongs to a chat message
//         that knows its item. PMI wraps the tray's apply button: while a PMI item's damage is applied, it
//         notes each target's hit points before and after, and a drop from above 0 to 0 is a kill.
//
// What PMI writes (CLAUDE.md rule 1): its own chat messages, and the charges of the PMI item itself
// (restoreCharges). Damage, healing and conditions are never applied by PMI: the triggered activity posts
// dnd5e's normal chat card, and a person applies the result with dnd5e's own buttons.
import { MODULE_ID } from "../config.mjs";
import { isPmiItem } from "../util.mjs";

/** The PMI triggers on an item for one event (a copy; empty for anything else). */
export function triggersOf(item, on) {
  if (!isPmiItem(item)) return [];
  const list = item.getFlag(MODULE_ID, "triggers");
  return Array.isArray(list) ? foundry.utils.deepClone(list.filter((t) => t?.on === on)) : [];
}

/** The kill-attribution context while a PMI item's damage is being applied. */
let applying = null;

export function registerTriggers() {
  Hooks.on("dnd5e.rollAttackV2", onAttackRoll);
  Hooks.on("dnd5e.preApplyDamage", onPreApplyDamage);
  Hooks.on("dnd5e.applyDamage", onApplyDamage);
  if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    libWrapper.register(
      MODULE_ID,
      "dnd5e.applications.components.DamageApplicationElement.prototype._onApplyDamage",
      wrapApplyDamage,
      "WRAPPER",
    );
  }
}

/** Crit: on the client that rolled. */
export async function onAttackRoll(rolls, data = {}) {
  const item = data?.subject?.item;
  const triggers = triggersOf(item, "crit");
  if (!triggers.length) return;
  if (!(rolls ?? []).some((r) => r?.isCritical)) return;
  await fire(item, triggers, 1);
}

/**
 * Wraps dnd5e's apply-damage button. Anything that isn't a PMI item with a kill trigger goes straight
 * through, unchanged (rule 10).
 */
export async function wrapApplyDamage(wrapped, ...args) {
  const item = this?.chatMessage?.getAssociatedItem?.();
  const triggers = triggersOf(item, "kill");
  if (!triggers.length || applying) return wrapped(...args);
  const ctx = { hpBefore: new Map(), kills: 0 };
  applying = ctx;
  try {
    return await wrapped(...args);
  } finally {
    applying = null;
    if (ctx.kills) await fire(item, triggers, ctx.kills);
  }
}

export function onPreApplyDamage(actor) {
  if (!applying || !actor?.uuid) return;
  applying.hpBefore.set(actor.uuid, Number(actor.system?.attributes?.hp?.value) || 0);
}

export function onApplyDamage(actor) {
  if (!applying || !applying.hpBefore.has(actor?.uuid)) return;
  const before = applying.hpBefore.get(actor.uuid);
  const after = Number(actor.system?.attributes?.hp?.value) || 0;
  if (before > 0 && after <= 0) applying.kills++;
}

/**
 * Run triggers, `times` times each (one per kill). Fails safe: a missing activity or an error is logged
 * and skipped, never "repaired" (rule 12).
 */
export async function fire(item, triggers, times = 1) {
  if (!isPmiItem(item) || !item.isOwner) return;
  for (const t of triggers) {
    for (let n = 0; n < times; n++) {
      try {
        if (t.restoreCharges) await restoreCharges(item, t.restoreCharges);
        else {
          const activity = item.system.activities?.get(t.activity);
          if (!activity) { console.warn(`${MODULE_ID} | ${item.name}: trigger activity ${t.activity} is missing`); continue; }
          await activity.use({}, { configure: false });
        }
      } catch (err) {
        console.error(`${MODULE_ID} | Trigger failed on ${item.name}`, err);
      }
    }
  }
}

/** Give back charges on the PMI item itself, and say so in chat. */
async function restoreCharges(item, n) {
  const uses = item.system.uses;
  if (!uses?.max) return;
  const spent = Math.max(0, (Number(uses.spent) || 0) - n);
  if (spent === uses.spent) return;
  await item.update({ "system.uses.spent": spent });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: item.actor }),
    content: `<p>${game.i18n.format("PMI.Triggers.ChargesRestored", { name: item.name, count: (Number(uses.spent) || 0) - spent })}</p>`,
    flags: { [MODULE_ID]: { trigger: "restoreCharges", item: item.uuid } },
  });
}
