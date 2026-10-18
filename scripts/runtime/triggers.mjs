// Tier 3 triggers: things a PMI item does by itself when something happens in play.
//
//   crit    dnd5e announces every attack roll (dnd5e.rollAttackV2). When a PMI item with a "crit" trigger
//           rolls a critical hit, PMI uses the trigger's activity, on the client that rolled.
//   fumble  the same, for a natural 1.
//   hit     Damage rolled by a PMI item's *attack* activity means it hit; other damage (a save, the trigger's
//           own damage card) is ignored. PMI listens for both dnd5e's damage-roll hook (dnd5e.rollDamageV2) and
//           the damage roll's chat message, since roll-automation modules may skip one or the other, and fires
//           once per roll whichever it sees first.
//   dawn    dnd5e announces finished rests (dnd5e.restCompleted). After a rest that starts a new day, each PMI
//           item the resting actor carries with a "dawn" trigger fires, on the client that rested.
//   kill  dnd5e doesn't say where damage came from, but its "apply damage" tray belongs to a chat message
//         that knows its item. PMI wraps the tray's apply button: while a PMI item's damage is applied, it
//         notes each target's hit points before and after, and a drop from above 0 to 0 is a kill.
//
// What PMI writes (CLAUDE.md rule 1): its own chat messages, and the charges of the PMI item itself
// (restoreCharges). Damage, healing and conditions are never applied by PMI: the triggered activity posts
// dnd5e's normal chat card, and a person applies the result with dnd5e's own buttons.
import { MODULE_ID } from "../config.mjs";
import { isPmiItem } from "../util.mjs";

/** Written by tools/build.py. main.mjs compares it with the module version to spot stale cached scripts. */
export const RUNTIME_VERSION = "0.10.4";

/** Console tracing for triggers, switched on by the "Log triggers" client setting (see settings.mjs). */
let tracing = () => false;
export function setTracing(fn) { tracing = fn; }
function trace(...args) {
  try { if (tracing()) console.log(`${MODULE_ID} | trigger:`, ...args); } catch { /* never let logging break play */ }
}

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
  Hooks.on("dnd5e.rollDamageV2", onDamageRoll);
  Hooks.on("createChatMessage", onChatMessage);
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
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

/** Crit and fumble: on the client that rolled. */
export async function onAttackRoll(rolls, data = {}) {
  const item = data?.subject?.item;
  if (!isPmiItem(item)) return;
  const list = Array.isArray(rolls) ? rolls : [];
  if (list.some((r) => r?.isCritical)) await fire(item, triggersOf(item, "crit"), 1);
  if (list.some((r) => r?.isFumble)) await fire(item, triggersOf(item, "fumble"), 1);
}

/**
 * One damage roll can be seen twice (its chat message, then dnd5e's hook). Remember recent rolls by item and
 * result for a few seconds so each fires once.
 */
const recentHits = new Map();
export function claimHit(item, rolls, now = Date.now()) {
  for (const [k, t] of recentHits) if (now - t > 5000) recentHits.delete(k);
  const sig = (Array.isArray(rolls) ? rolls : []).map((r) => `${r?.formula ?? ""}=${r?.total ?? ""}`).join(";");
  const key = `${item?.uuid ?? ""}|${sig}`;
  if (recentHits.has(key)) return false;
  recentHits.set(key, now);
  return true;
}

async function onHit(item, rolls, source) {
  const triggers = triggersOf(item, "hit");
  if (!triggers.length) return;
  if (!claimHit(item, rolls)) { trace(`hit on ${item.name} already handled (${source})`); return; }
  trace(`hit on ${item.name} (${source}): firing ${triggers.length} trigger(s)`);
  await fire(item, triggers, 1);
}

/** Hit, from dnd5e's damage-roll hook: damage rolled by the item's attack activity. On the client that rolled. */
export async function onDamageRoll(rolls, data = {}) {
  const activity = data?.subject;
  if (isPmiItem(activity?.item)) trace(`damage roll by ${activity.item.name}, activity type ${activity?.type}`);
  if (activity?.type !== "attack") return;
  await onHit(activity.item, rolls, "damage hook");
}

/** Hit, from the damage roll's chat message. Only the user who rolled it acts. */
export async function onChatMessage(message, options, userId) {
  if (userId !== game.user?.id) return;
  const flag = (k) => message?.getFlag?.("dnd5e", k);
  if (flag("roll.type") !== "damage" || flag("activity.type") !== "attack") return;
  const item = message.getAssociatedItem?.();
  if (!isPmiItem(item)) return;
  trace(`damage message for ${item.name}`);
  await onHit(item, message.rolls, "chat message");
}

/** Dawn: a rest that starts a new day, for the PMI items the resting actor carries. */
export async function onRestCompleted(actor, result = {}) {
  if (!result?.newDay || !actor?.items) return;
  for (const item of actor.items) {
    const triggers = triggersOf(item, "dawn");
    if (triggers.length) await fire(item, triggers, 1);
  }
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
  if (!triggers?.length || !isPmiItem(item)) return;
  if (!item.isOwner) { trace(`${item.name}: not the owner, so not firing`); return; }
  for (const t of triggers) {
    for (let n = 0; n < times; n++) {
      try {
        if (t.restoreCharges) await restoreCharges(item, t.restoreCharges);
        else {
          const activity = item.system.activities?.get(t.activity);
          if (!activity) { console.warn(`${MODULE_ID} | ${item.name}: trigger activity ${t.activity} is missing`); continue; }
          trace(`${item.name}: using "${activity.name}" (${activity.type}) for ${t.on}`);
          const result = await useActivity(item, activity);
          if (!result) console.warn(`${MODULE_ID} | ${item.name}: dnd5e didn't use "${activity.name}" (another module may have stopped it)`);
        }
      } catch (err) {
        console.error(`${MODULE_ID} | Trigger failed on ${item.name}`, err);
      }
    }
  }
}

/**
 * The wielder as a dnd5e target descriptor, for activities aimed at the user themselves.
 * dnd5e otherwise records the user's current targets on the card, which during an attack is the enemy.
 */
export function selfTargets(actor) {
  if (!actor?.uuid) return [];
  const token = actor.getActiveTokens?.()[0];
  return [{ name: token?.name ?? actor.name, img: actor.img, uuid: actor.uuid, ac: actor.system?.attributes?.ac?.value ?? null }];
}

/**
 * Use a triggered activity without its configuration dialog.
 *
 * Self-damage (a drawback's spines) skips the activity's usage card and goes straight to one damage roll aimed
 * at the wielder: no second copy of the item's description in chat, and nothing that would ask other modules
 * to retarget. dnd5e would otherwise write the player's current targets (the enemy) onto the card. Only
 * activities that spend nothing take this path; anything with uses or charges goes through dnd5e's normal use.
 * The player's own targets are left as they were (and put back if another module changed them meanwhile).
 */
export async function useActivity(item, activity) {
  const spends = (activity.consumption?.targets?.length ?? 0) > 0 || !!activity.uses?.max;
  const self = activity.type === "damage" && activity.target?.affects?.type === "self"
    && typeof activity.rollDamage === "function" && !spends;
  if (!self) return activity.use({}, { configure: false });
  const keep = currentTargetIds();
  try {
    const rolls = await activity.rollDamage({}, { configure: false }, {
      data: {
        "flags.dnd5e.targets": selfTargets(item.actor),
        flavor: `${item.name}: ${activity.name}`,
      },
    });
    return rolls ?? null;
  } finally {
    restoreTargets(keep);
  }
}

/** The ids of the tokens this user has targeted, or null if targeting isn't available. */
function currentTargetIds() {
  try {
    const t = game.user?.targets;
    return t ? [...t].map((tok) => tok.id) : null;
  } catch { return null; }
}

/** Put this user's targets back if something changed them. Client-side only: no document changes. */
function restoreTargets(ids) {
  if (!ids) return;
  try {
    const now = currentTargetIds() ?? [];
    if (now.length === ids.length && now.every((id) => ids.includes(id))) return;
    trace(`targets changed during the trigger; restoring ${ids.length} target(s)`);
    game.user.updateTokenTargets?.(ids);
  } catch (err) {
    console.warn(`${MODULE_ID} | Couldn't restore your targets`, err);
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
