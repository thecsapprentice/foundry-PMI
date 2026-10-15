// Recipe + base item → plain dnd5e item data. Pure: no Foundry globals.
import { MODULE_ID, RARITY_RULES, SLOTS } from "../config.mjs";
import { stableId } from "../generator/rng.mjs";
import { substitute } from "../generator/params.mjs";
import { buildName } from "./naming.mjs";
import { buildDescription } from "./description.mjs";

/** Top-level fields of the base item's source that a new item must not inherit. */
const DROP = ["_id", "folder", "sort", "ownership", "_stats", "flags"];

/**
 * Compile a recipe.
 * @param {object} recipe
 * @param {object} base                Source data of the mundane base item.
 * @param {object} opts
 * @param {(id: string) => object|null} opts.getDef         Property lookup.
 * @param {(type: string) => Function|null} opts.getTranslator  Change-type lookup.
 * @param {(key: string) => string} [opts.localize]       For labels; identity by default.
 * @returns {{ data: object|null, errors: string[], warnings: string[] }}
 *   `data` is null whenever there are errors: a half-built item is never returned.
 */
export function compile(recipe, base, { getDef, getTranslator, localize = (k) => k }) {
  const errors = [];
  const warnings = [];
  if (!base) return { data: null, errors: ["No base item"], warnings };
  const rules = RARITY_RULES[recipe.rarity];
  if (!rules) return { data: null, errors: [`Unknown rarity ${recipe.rarity}`], warnings };

  const data = structuredClone(base);
  for (const k of DROP) delete data[k];
  data.effects = (data.effects ?? []).map((e) => ({ ...e }));
  data.system.activities ??= {};

  // Picks in slot order, so names, descriptions and stacking are the same however the DM added them.
  const ordered = recipe.picks
    .map((pick, index) => ({ pick, index, def: getDef(pick.id) }))
    .sort((a, b) => SLOTS.indexOf(a.def?.slot) - SLOTS.indexOf(b.def?.slot) || a.index - b.index);

  const resolved = [];
  for (const { pick, def } of ordered) {
    if (!def) { errors.push(`Unknown property "${pick.id}"`); continue; }
    const vars = { ...pick.params, dc: rules.saveDC, rarity: recipe.rarity };
    const missing = new Set();
    const changes = substitute(def.changes ?? [], vars, missing);
    if (missing.size) { errors.push(`${def.id}: unknown variables ${[...missing].map((m) => `@${m}`).join(", ")}`); continue; }
    const textMissing = new Set();
    const label = substitute(def.label ?? def.name ?? def.id, vars, textMissing);
    const text = substitute(def.text ?? "", vars, textMissing);
    const nameFragment = substitute(def.name ?? "", vars, textMissing);
    if (textMissing.size) warnings.push(`${def.id}: text uses unknown variables ${[...textMissing].join(", ")}`);
    resolved.push({ pick, def, changes, label: localize(label), text, nameFragment });
  }

  for (const r of resolved) {
    const ctx = {
      pick: r.pick,
      def: r.def,
      rarity: recipe.rarity,
      label: r.label,
      img: data.img,
      id: (suffix) => stableId(`${recipe.seed}/${r.pick.seed}/${r.def.id}/${suffix}`),
      warn: (m) => warnings.push(`${r.def.id}: ${m}`),
    };
    for (const change of r.changes) {
      const translate = getTranslator(change.type);
      if (!translate) { errors.push(`${r.def.id}: unknown change type "${change.type}"`); continue; }
      try {
        translate(data, change, ctx);
      } catch (err) {
        errors.push(`${r.def.id}: ${err.message}`);
      }
    }
  }
  if (errors.length) return { data: null, errors, warnings };

  // Item-level results.
  const baseName = base.name;
  data.name = buildName(baseName, resolved);
  data.system.rarity = recipe.rarity;
  data.system.properties = [...new Set([...(data.system.properties ?? []), "mgc"])];
  data.system.attunement = resolved.some((r) => r.def.attunement) ? "required" : (base.system.attunement ?? "");
  data.system.attuned = false;
  data.system.equipped = false;
  data.system.identified = true;
  data.system.unidentified = { name: baseName, description: base.system.unidentified?.description ?? "" };
  data.system.price = { value: (base.system.price?.value ?? 0) + rules.price, denomination: "gp" };
  data.system.description = {
    ...(base.system.description ?? {}),
    value: buildDescription(resolved, base.system.description?.value ?? "", data.system.attunement === "required"),
  };
  data.flags = { [MODULE_ID]: { recipe: structuredClone(recipe) } };
  return { data, errors, warnings };
}
