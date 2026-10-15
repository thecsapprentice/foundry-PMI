// Built-in change types. Each translator turns one `change` from a property into dnd5e item data,
// mutating the plain item data being compiled. Pure: no Foundry globals.
//
// ctx: { pick, def, rarity, label, id(suffix) → stable id, img, warn(msg) }
// Translators throw an Error when a change can't be applied; the compiler reports it and the builder
// refuses to create the item (fail safe).
import { EFFECT_MODES, MODULE_ID } from "../config.mjs";
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

  /** { changes: [{ key, mode, value }], name? } → one transfer Active Effect on the item. */
  effect(data, change, ctx) {
    if (!Array.isArray(change.changes) || !change.changes.length) throw new Error("effect needs changes");
    const changes = change.changes.map((c) => {
      if (!EFFECT_KEYS.some((re) => re.test(c.key))) throw new Error(`effect key not allowed: ${c.key}`);
      const mode = typeof c.mode === "number" ? c.mode : EFFECT_MODES[c.mode];
      if (mode === undefined) throw new Error(`unknown effect mode: ${c.mode}`);
      return { key: c.key, mode, value: String(c.value), priority: null };
    });
    data.effects ??= [];
    data.effects.push({
      _id: ctx.id(`effect:${data.effects.length}`),
      name: change.name ?? ctx.label,
      img: change.img ?? ctx.img,
      type: "base",
      system: {},
      changes,
      disabled: false,
      duration: { startTime: null, seconds: null, combat: null, rounds: null, turns: null, startRound: null, startTurn: null },
      description: "",
      origin: null,
      tint: "#ffffff",
      transfer: change.transfer ?? true,
      statuses: [],
      sort: 0,
      flags: { [MODULE_ID]: { property: ctx.pick.id } },
    });
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
   * A Save activity: { name, ability: ["con"], dc, damage: [{ formula, types }], onSave: "half"|"none"|"full",
   *   charges: 1, range: { value, units }, target: { type, count } | { template: { type, size } }, activation }
   */
  saveActivity(data, change, ctx) {
    const abilities = [].concat(change.ability ?? []);
    if (!abilities.length) throw new Error("saveActivity needs an ability");
    const dc = Number(change.dc);
    if (!Number.isInteger(dc) || dc < 1) throw new Error(`saveActivity needs a whole-number DC, got ${change.dc}`);
    if (change.charges && !data.system.uses?.max) throw new Error("saveActivity spends charges but the item has none (add a uses change first)");
    const id = ctx.id("save");
    data.system.activities ??= {};
    data.system.activities[id] = {
      _id: id,
      type: "save",
      name: change.name ?? ctx.label,
      img: change.img ?? ctx.img,
      sort: 100000 + Object.keys(data.system.activities).length,
      activation: { type: change.activation ?? "action", value: 1, condition: "", override: false },
      consumption: {
        targets: change.charges ? [{ type: "itemUses", target: "", value: String(change.charges), scaling: { mode: "", formula: "" } }] : [],
        scaling: { allowed: false, max: "" },
        spellSlot: false,
      },
      range: { value: change.range?.value != null ? String(change.range.value) : "", units: change.range?.units ?? (change.range ? "ft" : "self"), special: "", override: false },
      target: {
        template: { count: "", contiguous: false, type: change.target?.template?.type ?? "", size: change.target?.template?.size != null ? String(change.target.template.size) : "", width: "", height: "", units: "ft" },
        affects: { count: change.target?.count != null ? String(change.target.count) : "", type: change.target?.type ?? "creature", choice: false, special: "" },
        prompt: true,
        override: false,
      },
      damage: { onSave: change.onSave ?? "half", parts: (change.damage ?? []).map((d) => damagePart(d.formula, [].concat(d.types ?? []))) },
      save: { ability: abilities, dc: { calculation: "", formula: String(dc) } },
      effects: [],
      uses: { spent: 0, recovery: [] },
      description: { chatFlavor: "" },
      duration: { concentration: false, value: "", units: "inst", special: "", override: false },
    };
  },
};
