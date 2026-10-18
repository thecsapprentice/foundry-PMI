// Built-in change types. Each translator turns one `change` from a property into dnd5e item data,
// mutating the plain item data being compiled. Pure: no Foundry globals.
//
// ctx: { pick, def, rarity, label, id(suffix) → stable id, img, warn(msg) }
// Translators throw an Error when a change can't be applied; the compiler reports it and the builder
// refuses to create the item (fail safe).
import { EFFECT_MODES, MODULE_ID, CHARGE_POOLS } from "../config.mjs";
import { damagePart } from "./damage.mjs";

const ABILITY = "(str|dex|con|int|wis|cha)";
const SKILL = "(acr|ani|arc|ath|dec|his|ins|itm|inv|med|nat|prc|prf|per|rel|slt|ste|sur)";

/** Active Effect keys properties may use. Anything else is refused, so typos and risky keys fail loudly. */
export const EFFECT_KEYS = [
  /^system\.attributes\.ac\.bonus$/,
  /^system\.attributes\.init\.bonus$/,
  /^system\.attributes\.movement\.(walk|fly|swim|climb|burrow)$/,
  /^system\.attributes\.senses\.(darkvision|blindsight|tremorsense|truesight)$/,
  /^system\.attributes\.hp\.bonuses\.(level|overall)$/,
  /^system\.traits\.(dr|di|dv|ci)\.value$/,
  /^system\.traits\.languages\.value$/,
  new RegExp(`^system\\.abilities\\.${ABILITY}\\.(value|bonuses\\.save|bonuses\\.check)$`),
  /^system\.bonuses\.abilities\.(save|check|skill)$/,
  /^system\.bonuses\.(mwak|rwak|msak|rsak)\.(attack|damage)$/,
  /^system\.bonuses\.spell\.dc$/,
  new RegExp(`^system\\.skills\\.${SKILL}\\.bonuses\\.(check|passive)$`),
  // Advantage: dnd5e counts sources of advantage with mode "add" and value 1.
  new RegExp(`^system\\.skills\\.${SKILL}\\.roll\\.mode$`),
  new RegExp(`^system\\.abilities\\.${ABILITY}\\.(check|save)\\.roll\\.mode$`),
  /^system\.attributes\.(init|concentration|death)\.roll\.mode$/,
  /^flags\.dnd5e\.initiativeAdv$/,
];

/** Item fields `itemField` may change, and how. */
export const ITEM_FIELDS = {
  "system.strength": ["set"],
  "system.armor.dex": ["set"],
  "system.properties": ["addToSet", "removeFromSet"],
  "system.weight.value": ["set", "multiply"],
  "system.range.value": ["add", "set"],
  "system.range.long": ["add", "set"],
  "system.range.reach": ["add", "set"],
};

const get = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);
function set(obj, path, value) {
  const parts = path.split(".");
  let o = obj;
  for (const k of parts.slice(0, -1)) o = (o[k] ??= {});
  o[parts.at(-1)] = value;
}

function attackActivities(data) {
  const acts = Object.values(data.system.activities ?? {}).filter((a) => a.type === "attack");
  if (!acts.length) throw new Error("the base item has no attack activity");
  return acts;
}

/** Events a trigger can react to, with the condition text written on its activity. */
export const TRIGGER_EVENTS = {
  crit: "When you score a critical hit with this weapon",
  kill: "When you reduce a creature to 0 hit points with this weapon",
  hit: "When you hit with this weapon and roll its damage",
  fumble: "When you roll a 1 on the d20 for an attack with this weapon",
  dawn: "At dawn, when you finish a long rest",
};
/** Events that come from this item's own attacks, so the item needs an attack. */
const ATTACK_EVENTS = ["crit", "kill", "hit", "fumble"];
const TRIGGERABLE = ["saveActivity", "healActivity", "activate", "damageActivity", "checkActivity"];

/** Order change types run in: charge pools first, then things that spend them, then changes to the pool. */
export const CHANGE_ORDER = { uses: 0, usesBonus: 2, trigger: 3 };

/**
 * Charges a castSpell change spends: `chargesByKind[kind]`, else `charges`, else 1. "level" means the spell's level.
 * Shared by the translator and the compiler (for description text).
 */
export function castCharges(change, kind, level) {
  let c = change.chargesByKind?.[kind] ?? change.chargesByKind?.default ?? change.charges ?? 1;
  if (c === "level") c = Math.max(1, Number(level) || 1);
  c = Number(c);
  if (!Number.isInteger(c) || c < 0) throw new Error(`castSpell charges must be a whole number, got ${c}`);
  return c;
}

function ensurePool(data, pool) {
  if (data.system.uses?.max) return;
  data.system.uses = { max: String(pool.max), spent: 0, recovery: [{ period: "dawn", type: "formula", formula: String(pool.formula) }] };
}

/** Effect changes from property data, checked against EFFECT_KEYS. */
function effectChanges(list) {
  if (!Array.isArray(list)) throw new Error("effect changes must be a list");
  return list.map((c) => {
    if (!EFFECT_KEYS.some((re) => re.test(c.key))) throw new Error(`effect key not allowed: ${c.key}`);
    const mode = typeof c.mode === "number" ? c.mode : EFFECT_MODES[c.mode];
    if (mode === undefined) throw new Error(`unknown effect mode: ${c.mode}`);
    return { key: c.key, mode, value: String(c.value), priority: null };
  });
}

/** Active Effect duration fields for { value, units } in minutes, hours or rounds. */
function effectDuration({ value, units } = {}) {
  const d = { startTime: null, seconds: null, combat: null, rounds: null, turns: null, startRound: null, startTurn: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return d;
  if (units === "round") d.rounds = n;
  else if (units === "minute") d.seconds = n * 60;
  else if (units === "hour") d.seconds = n * 3600;
  else throw new Error(`duration units must be round, minute or hour, got ${units}`);
  return d;
}

function newEffect(ctx, data, { name, img, changes, statuses = [], transfer, duration }) {
  data.effects ??= [];
  return {
    _id: ctx.id(`effect:${data.effects.length}`),
    name: name ?? ctx.label,
    img: img ?? ctx.img,
    type: "base",
    system: {},
    changes,
    disabled: false,
    duration: duration ?? effectDuration(),
    description: "",
    origin: null,
    tint: "#ffffff",
    transfer,
    statuses: [...statuses],
    sort: 0,
    flags: { [MODULE_ID]: { property: ctx.pick.id } },
  };
}

/**
 * How often an activity can be used: { perDay } gives it its own uses regained at dawn, { charges } spends
 * the item's charges (creating the kind's pool if the item has none). With `required`, one must be given.
 * @returns {{ uses: object, targets: object[] }}
 */
function limits(change, data, ctx, { required = true } = {}) {
  const perDay = change.perDay != null ? Number(change.perDay) : null;
  const charges = change.charges != null ? Number(change.charges) : null;
  if (perDay != null && charges != null) throw new Error("use either perDay or charges, not both");
  if (required && perDay == null && charges == null) throw new Error("needs perDay or charges");
  if (perDay != null && (!Number.isInteger(perDay) || perDay < 1)) throw new Error(`perDay must be a positive whole number, got ${change.perDay}`);
  if (charges != null && (!Number.isInteger(charges) || charges < 1)) throw new Error(`charges must be a positive whole number, got ${change.charges}`);
  if (charges != null) ensurePool(data, change.pool ?? CHARGE_POOLS[ctx.kind] ?? CHARGE_POOLS.default);
  const target = (type, value) => ({ type, target: "", value: String(value), scaling: { mode: "", formula: "" } });
  if (perDay != null) {
    return { uses: { spent: 0, max: String(perDay), recovery: [{ period: "dawn", type: "recoverAll", formula: "" }] }, targets: [target("activityUses", 1)] };
  }
  return { uses: { spent: 0, recovery: [] }, targets: charges != null ? [target("itemUses", charges)] : [] };
}

/** Activation data: { activation: "action" | "bonus" | "reaction" | "special", activationCondition }. */
function activationOf(change) {
  const type = change.activation ?? "action";
  return { type, value: type === "special" ? null : 1, condition: change.activationCondition ?? "", override: false };
}

/** Fields every activity needs, with sensible defaults; `extra` overrides or adds. */
function baseActivity(id, type, ctx, change, data, extra) {
  return {
    _id: id,
    type,
    name: change.name ?? ctx.label,
    img: change.img ?? ctx.img,
    sort: 100000 + Object.keys(data.system.activities ?? {}).length,
    activation: activationOf(change),
    consumption: { targets: [], scaling: { allowed: false, max: "" }, spellSlot: false },
    description: { chatFlavor: "" },
    duration: { concentration: false, value: "", units: "inst", special: "", override: false },
    range: { value: "", units: "self", special: "", override: false },
    target: {
      template: { count: "", contiguous: false, type: "", size: "", width: "", height: "", units: "" },
      affects: { count: "", type: "self", choice: false, special: "" },
      prompt: false,
      override: false,
    },
    uses: { spent: 0, recovery: [] },
    effects: [],
    ...extra,
  };
}

export const BUILTIN_TRANSLATORS = {
  /** { value: 1|2|3 } → weapon `magicalBonus`, or armor/shield `armor.magicalBonus`. Never lowers it. */
  magicalBonus(data, change) {
    const v = Number(change.value);
    if (!Number.isInteger(v) || v < 0) throw new Error(`magicalBonus needs a whole number, got ${change.value}`);
    const path = data.type === "weapon" ? "system.magicalBonus" : "system.armor.magicalBonus";
    set(data, path, Math.max(Number(get(data, path)) || 0, v));
  },

  /** { path, mode, value } on an allowlisted item field. */
  itemField(data, change) {
    const modes = ITEM_FIELDS[change.path];
    if (!modes) throw new Error(`itemField can't change ${change.path}`);
    if (!modes.includes(change.mode)) throw new Error(`itemField can't ${change.mode} ${change.path}`);
    const cur = get(data, change.path);
    switch (change.mode) {
      case "set": set(data, change.path, change.value); break;
      case "add": set(data, change.path, (Number(cur) || 0) + Number(change.value)); break;
      case "multiply": set(data, change.path, (Number(cur) || 0) * Number(change.value)); break;
      case "addToSet": set(data, change.path, [...new Set([...(cur ?? []), ...[].concat(change.value)])]); break;
      case "removeFromSet": set(data, change.path, (cur ?? []).filter((x) => ![].concat(change.value).includes(x))); break;
    }
  },

  /** { formula, types } → an extra damage part on every attack activity. */
  activityDamage(data, change) {
    if (!change.formula) throw new Error("activityDamage needs a formula");
    const types = [].concat(change.types ?? []);
    for (const act of attackActivities(data)) {
      act.damage ??= { critical: { bonus: "" }, includeBase: true, parts: [] };
      act.damage.parts ??= [];
      act.damage.parts.push(damagePart(change.formula, types));
    }
  },

  /** { threshold?, bonus? } → attack critical range and extra critical damage on every attack activity. */
  attackCritical(data, change) {
    for (const act of attackActivities(data)) {
      if (change.threshold != null) {
        const t = Number(change.threshold);
        if (!Number.isInteger(t) || t < 2 || t > 20) throw new Error(`critical threshold must be 2–20, got ${change.threshold}`);
        act.attack ??= {};
        act.attack.critical ??= {};
        act.attack.critical.threshold = Math.min(act.attack.critical.threshold ?? 20, t);
      }
      if (change.bonus) {
        act.damage ??= { critical: { bonus: "" }, includeBase: true, parts: [] };
        act.damage.critical ??= { bonus: "" };
        const cur = act.damage.critical.bonus;
        act.damage.critical.bonus = cur ? `${cur} + ${change.bonus}` : String(change.bonus);
      }
    }
  },

  /** { bonus } → an extra attack-roll bonus (not damage) on every attack activity. */
  attackBonus(data, change) {
    const b = String(change.bonus ?? "").trim();
    if (!/^[+-]?\d+$/.test(b)) throw new Error(`attackBonus needs a whole number, got ${change.bonus}`);
    const n = Number(b);
    for (const act of attackActivities(data)) {
      act.attack ??= {};
      const cur = String(act.attack.bonus ?? "").trim();
      act.attack.bonus = cur ? `${cur} ${n < 0 ? "-" : "+"} ${Math.abs(n)}` : String(n);
    }
  },

  /**
   * A Heal activity the wearer uses on themselves:
   *   { name, formula, healType: "healing" | "temphp", activation, perDay | charges }
   */
  healActivity(data, change, ctx) {
    if (!change.formula) throw new Error("healActivity needs a formula");
    const type = change.healType ?? "healing";
    if (!["healing", "temphp"].includes(type)) throw new Error(`healActivity type must be healing or temphp, got ${type}`);
    const { uses, targets } = limits(change, data, ctx, { required: change.activation !== "special" });
    const id = ctx.id("heal");
    data.system.activities ??= {};
    data.system.activities[id] = baseActivity(id, "heal", ctx, change, data, {
      consumption: { targets, scaling: { allowed: false, max: "" }, spellSlot: false },
      uses,
      healing: damagePart(change.formula, [type]),
    });
  },

  /**
   * Something that happens automatically on an event (Tier 3; PMI's runtime watches for the event):
   *   { on: "crit" | "kill", do: { type: "saveActivity" | "healActivity" | "activate", … } }
   *       creates that activity with activation "Special" and the event as its condition, and PMI uses it
   *       when the event happens. Without PMI the activity stays on the item for the player to use by hand.
   *   { on: "kill", restoreCharges: 1 }
   *       PMI restores that many of the item's charges.
   * Triggers are recorded in flags.foundry-pmi.triggers.
   */
  trigger(data, change, ctx) {
    if (!TRIGGER_EVENTS[change.on]) throw new Error(`trigger "on" must be one of ${Object.keys(TRIGGER_EVENTS).join(", ")}`);
    if (ATTACK_EVENTS.includes(change.on)) attackActivities(data);
    const record = { on: change.on, property: ctx.pick.id };
    if (change.restoreCharges != null) {
      const n = Number(change.restoreCharges);
      if (!Number.isInteger(n) || n < 1) throw new Error(`restoreCharges must be a positive whole number, got ${change.restoreCharges}`);
      if (!data.system.uses?.max) throw new Error("restoreCharges needs an item with charges");
      record.restoreCharges = n;
    } else {
      const type = change.do?.type;
      if (!TRIGGERABLE.includes(type)) throw new Error(`trigger "do" must be one of ${TRIGGERABLE.join(", ")}`);
      const before = new Set(Object.keys(data.system.activities ?? {}));
      BUILTIN_TRANSLATORS[type](data, { ...change.do, activation: "special", activationCondition: TRIGGER_EVENTS[change.on] }, ctx);
      const added = Object.keys(data.system.activities ?? {}).filter((k) => !before.has(k));
      if (added.length !== 1) throw new Error("trigger must create exactly one activity");
      record.activity = added[0];
    }
    data.flags ??= {};
    data.flags[MODULE_ID] ??= {};
    (data.flags[MODULE_ID].triggers ??= []).push(record);
  },

  /** { changes: [{ key, mode, value }], name? } → one transfer Active Effect on the item. */
  effect(data, change, ctx) {
    if (!Array.isArray(change.changes) || !change.changes.length) throw new Error("effect needs changes");
    data.effects ??= [];
    data.effects.push(newEffect(ctx, data, { name: change.name, img: change.img, changes: effectChanges(change.changes), transfer: change.transfer ?? true }));
  },

  /**
   * A power the wearer activates: a Utility activity that applies a timed effect to themselves.
   *   { name, activation: "action" | "bonus" | "reaction", duration: { value, units: "round" | "minute" | "hour" },
   *     changes: [{ key, mode, value }], statuses: ["invisible"], perDay: 1 | charges: 1 }
   * `perDay` gives the activity its own uses, regained at dawn; `charges` spends the item's charges instead.
   * The effect isn't transferred: it sits on the item until the activity applies it (dnd5e's own flow).
   */
  activate(data, change, ctx) {
    const changes = effectChanges(change.changes ?? []);
    const statuses = [].concat(change.statuses ?? []);
    if (!changes.length && !statuses.length) throw new Error("activate needs changes or statuses");
    if (statuses.some((st) => typeof st !== "string" || !/^[a-z][\w-]*$/.test(st))) throw new Error("activate statuses must be status ids");
    // Powers the wearer clicks need a limit (perDay or charges); triggered ones (activation "special") don't.
    const { uses, targets } = limits(change, data, ctx, { required: change.activation !== "special" });
    const duration = { value: String(change.duration?.value ?? ""), units: change.duration?.units ?? "inst" };

    const effect = newEffect(ctx, data, {
      name: change.name ?? ctx.label, img: change.img, changes, statuses, transfer: false, duration: effectDuration(change.duration),
    });
    data.effects.push(effect);

    const id = ctx.id("activate");
    data.system.activities ??= {};
    data.system.activities[id] = {
      _id: id,
      type: "utility",
      name: change.name ?? ctx.label,
      img: change.img ?? ctx.img,
      sort: 100000 + Object.keys(data.system.activities).length,
      activation: activationOf(change),
      consumption: { targets, scaling: { allowed: false, max: "" }, spellSlot: false },
      description: { chatFlavor: "" },
      duration: { concentration: false, value: duration.value, units: duration.units, special: "", override: false },
      range: { value: "", units: "self", special: "", override: false },
      target: {
        template: { count: "", contiguous: false, type: "", size: "", width: "", height: "", units: "" },
        affects: { count: "", type: "self", choice: false, special: "" },
        prompt: false,
        override: false,
      },
      uses,
      effects: [{ _id: effect._id }],
      roll: { formula: "", name: "", prompt: false, visible: false },
    };
  },

  /** { max, recovery: [{ period, type, formula }] } → the item's charges. One property per item may set them. */
  uses(data, change) {
    if (data.system.uses?.max) throw new Error("the item already has charges from another property");
    if (!change.max) throw new Error("uses needs max");
    data.system.uses = {
      max: String(change.max),
      spent: 0,
      recovery: (change.recovery ?? []).map((r) => ({
        period: r.period ?? "lr",
        type: r.type ?? (r.formula ? "formula" : "recoverAll"),
        formula: r.formula ? String(r.formula) : "",
      })),
    };
  },

  /**
   * A Cast activity for a compendium spell, spending the item's charges:
   *   { spell: uuid, level, charges | chargesByKind: { wand: 1, default: "level" }, upcast, dc, attack, pool }
   * Creates the item's charge pool (CHARGE_POOLS by base kind, or `pool`) if it has none yet.
   * The spell is cast at a fixed DC and attack bonus (the DMG convention for wands and staves)
   * and needs no components.
   */
  castSpell(data, change, ctx) {
    const uuid = String(change.spell ?? "");
    if (!/^Compendium\.[\w-]+\.[\w-]+\.Item\.[A-Za-z0-9]{16}$|^Item\.[A-Za-z0-9]{16}$/.test(uuid)) throw new Error(`castSpell needs a spell UUID, got "${uuid}"`);
    const level = Number(change.level);
    if (!Number.isInteger(level) || level < 0 || level > 9) throw new Error(`castSpell needs a spell level 0–9, got ${change.level}`);
    const charges = castCharges(change, ctx.kind, level);
    // 0 charges means "at will" (cantrips): no pool needed.
    if (charges > 0) ensurePool(data, change.pool ?? CHARGE_POOLS[ctx.kind] ?? CHARGE_POOLS.default);
    const dc = change.dc != null ? Number(change.dc) : null;
    const attack = change.attack != null ? Number(change.attack) : null;
    const id = ctx.id("cast");
    data.system.activities ??= {};
    data.system.activities[id] = {
      _id: id,
      type: "cast",
      ...(change.name ? { name: change.name } : {}),
      sort: 100000 + Object.keys(data.system.activities).length,
      activation: { type: "action", value: null, condition: "", override: false },
      consumption: {
        targets: charges ? [{ type: "itemUses", target: "", value: String(charges), scaling: { mode: change.upcast ? "amount" : "", formula: "" } }] : [],
        scaling: { allowed: !!change.upcast && level > 0, max: change.upcast && level > 0 ? String(9 - level) : "" },
        spellSlot: true,
      },
      description: { chatFlavor: "" },
      duration: { concentration: false, value: "", units: "", special: "", override: false },
      range: { value: "", units: "", special: "", override: false },
      target: {
        template: { count: "", contiguous: false, type: "", size: "", width: "", height: "", units: "" },
        affects: { count: "", type: "", choice: false, special: "" },
        prompt: true,
        override: false,
      },
      uses: { spent: 0, recovery: [] },
      spell: {
        ability: "",
        challenge: { attack, save: dc, override: dc != null || attack != null },
        level,
        properties: ["vocal", "somatic", "material"], // components the item ignores: all of them
        spellbook: true,
        uuid,
      },
    };
  },

  /** { max } → more charges on the item's pool. Runs after pools are created; fails if the item has none. */
  usesBonus(data, change) {
    const add = Number(change.max);
    if (!Number.isInteger(add) || add <= 0) throw new Error(`usesBonus needs a positive whole number, got ${change.max}`);
    const cur = data.system.uses?.max;
    if (!cur) throw new Error("the item has no charges to add to");
    data.system.uses.max = /^\d+$/.test(cur) ? String(Number(cur) + add) : `${cur} + ${add}`;
  },

  /**
   * A Damage activity, by default aimed at the user themselves (drawbacks such as spines that bite the wielder):
   *   { name, formula, types: ["piercing"], target: "self" | "creature", activation, perDay | charges }
   * Using it posts dnd5e's normal card; a person applies the damage with the card's own buttons.
   */
  damageActivity(data, change, ctx) {
    if (!change.formula) throw new Error("damageActivity needs a formula");
    const types = [].concat(change.types ?? []);
    if (!types.length) throw new Error("damageActivity needs a damage type");
    const aim = change.target ?? "self";
    if (!["self", "creature"].includes(aim)) throw new Error(`damageActivity target must be self or creature, got ${aim}`);
    const { uses, targets } = limits(change, data, ctx, { required: false });
    const id = ctx.id("damage");
    data.system.activities ??= {};
    data.system.activities[id] = baseActivity(id, "damage", ctx, change, data, {
      consumption: { targets, scaling: { allowed: false, max: "" }, spellSlot: false },
      uses,
      ...(aim === "creature" ? {
        range: { value: "5", units: "ft", special: "", override: false },
        target: {
          template: { count: "", contiguous: false, type: "", size: "", width: "", height: "", units: "" },
          affects: { count: "1", type: "creature", choice: false, special: "" },
          prompt: true,
          override: false,
        },
      } : {}),
      damage: { critical: { allow: false, bonus: "" }, parts: [damagePart(change.formula, types)] },
    });
  },

  /**
   * A Check activity: the card asks for an ability or skill check against a DC.
   *   { name, skills: ["per", "itm"], ability: "" | "cha", dc, activation, perDay | charges }
   * With skills and no ability, each skill uses its own ability.
   */
  checkActivity(data, change, ctx) {
    const skills = [].concat(change.skills ?? []);
    const skillRe = new RegExp(`^${SKILL}$`);
    if (skills.some((sk) => !skillRe.test(sk))) throw new Error(`checkActivity skills must be skill ids, got ${skills.join(", ")}`);
    const ability = change.ability ?? "";
    if (ability && !new RegExp(`^${ABILITY}$`).test(ability)) throw new Error(`checkActivity ability must be an ability id, got ${ability}`);
    if (!skills.length && !ability) throw new Error("checkActivity needs skills or an ability");
    const dc = Number(change.dc);
    if (!Number.isInteger(dc) || dc < 1) throw new Error(`checkActivity needs a whole-number DC, got ${change.dc}`);
    const { uses, targets } = limits(change, data, ctx, { required: false });
    const id = ctx.id("check");
    data.system.activities ??= {};
    data.system.activities[id] = baseActivity(id, "check", ctx, change, data, {
      consumption: { targets, scaling: { allowed: false, max: "" }, spellSlot: false },
      uses,
      check: { ability, associated: skills, dc: { calculation: "", formula: String(dc) } },
    });
  },

  /**
   * A Save activity: { name, ability: ["con"], dc, damage: [{ formula, types }], onSave: "half"|"none"|"full",
   *   charges: 1, range: { value, units }, target: { type, count } | { template: { type, size } }, activation }
   */
  saveActivity(data, change, ctx) {
    const abilities = [].concat(change.ability ?? []);
    if (!abilities.length) throw new Error("saveActivity needs an ability");
    const dc = Number(change.dc);
    if (!Number.isInteger(dc) || dc < 1) throw new Error(`saveActivity needs a whole-number DC, got ${change.dc}`);
    const statuses = [].concat(change.statuses ?? []);
    if (statuses.some((st) => typeof st !== "string" || !/^[a-z][\w-]*$/.test(st))) throw new Error("saveActivity statuses must be status ids");
    if (!(change.damage ?? []).length && !statuses.length && !change.promptOnly) throw new Error("saveActivity needs damage, statuses or promptOnly");
    const { uses, targets } = limits(change, data, ctx, { required: false });

    // A condition on a failed save: an effect on the item that the activity applies to targets.
    const applied = [];
    if (statuses.length) {
      const effect = newEffect(ctx, data, {
        name: change.effectName ?? ctx.label, img: change.img, changes: [], statuses, transfer: false, duration: effectDuration(change.duration),
      });
      data.effects.push(effect);
      applied.push({ _id: effect._id, onSave: false });
    }

    const id = ctx.id("save");
    data.system.activities ??= {};
    data.system.activities[id] = baseActivity(id, "save", ctx, change, data, {
      consumption: { targets, scaling: { allowed: false, max: "" }, spellSlot: false },
      uses,
      range: { value: change.range?.value != null ? String(change.range.value) : "", units: change.range?.units ?? (change.range ? "ft" : "self"), special: "", override: false },
      target: {
        template: { count: "", contiguous: false, type: change.target?.template?.type ?? "", size: change.target?.template?.size != null ? String(change.target.template.size) : "", width: "", height: "", units: "ft" },
        affects: { count: change.target?.count != null ? String(change.target.count) : "", type: change.target?.type ?? "creature", choice: false, special: "" },
        prompt: true,
        override: false,
      },
      duration: change.duration
        ? { concentration: false, value: String(change.duration.value), units: change.duration.units, special: "", override: false }
        : { concentration: false, value: "", units: "inst", special: "", override: false },
      damage: { onSave: change.onSave ?? "half", parts: (change.damage ?? []).map((d) => damagePart(d.formula, [].concat(d.types ?? []))) },
      save: { ability: abilities, dc: { calculation: "", formula: String(dc) } },
      effects: applied,
    });
  },
};
