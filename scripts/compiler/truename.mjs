// True names and unidentified appearances. Pure: no Foundry globals.
//
// A true name is built from the item's strongest theme (the property with the highest cost + themeWeight)
// and its form (what the item is: blade, axe, cloak, boots…), in patterns borrowed from the fiction:
//   compound     Emberfang, Rimeward, Updraft          (theme root + form suffix)
//   possessive   Giant's Edge, Widow's Kiss           (theme figure + form noun)
//   single       Gloaming, Cinder                     (one evocative word)
//   invented     Calenmir, Khazdum, Vorthrax          (a word in one of several made-up tongues)
//   titled       Naurthel, the Emberfang              (invented word + kenning; very rare and up)
// Rarer items get longer, grander patterns. Every choice comes from a seeded stream, so a recipe always
// gives the same name until the DM rerolls it.
import { RARITIES } from "../config.mjs";
import { Rng } from "../generator/rng.mjs";
import { substitute } from "../generator/params.mjs";

const rank = (r) => RARITIES.indexOf(r);

/** Name patterns and their weights, by rarity (common and uncommon use rare's table when a name is forced). */
const PATTERNS = {
  rare:      { compound: 40, possessive: 30, invented: 15, single: 15 },
  veryRare:  { compound: 30, possessive: 20, invented: 15, titled: 35 },
  legendary: { titled: 45, compoundEpithet: 25, inventedEpithet: 30 },
  artifact:  { titled: 45, compoundEpithet: 25, inventedEpithet: 30 },
};

const AXES = ["battleaxe", "greataxe", "handaxe", "halberd"];
const BLUNT = ["club", "greatclub", "lighthammer", "mace", "maul", "morningstar", "warhammer", "flail", "quarterstaff", "warpick"];
const POLEARMS = ["spear", "javelin", "pike", "glaive", "lance", "trident"];
const RANGED = ["shortbow", "longbow", "lightcrossbow", "handcrossbow", "heavycrossbow", "sling", "blowgun", "dart"];
const GENERIC_WEAPON_CATS = ["weapon.melee", "weapon.ranged", "weapon.simple", "weapon.martial"];

/** What the item is, for naming: a key into the vocabulary's forms. */
export function formOf(categories) {
  for (const slot of ["staff", "wand", "rod", "ring", "neck", "cloak", "feet", "hands", "waist", "wrists", "head", "shield", "armor"]) {
    if (categories.includes(slot)) return slot;
  }
  const baseItem = (categories.find((c) => /^weapon\.[a-z]+$/.test(c) && !GENERIC_WEAPON_CATS.includes(c)) ?? "").slice(7);
  if (AXES.includes(baseItem)) return "axe";
  if (BLUNT.includes(baseItem)) return "blunt";
  if (POLEARMS.includes(baseItem)) return "polearm";
  if (RANGED.includes(baseItem) || categories.includes("weapon.ranged")) return "bow";
  return "blade";
}

/**
 * The item's themes, strongest first. Each resolved pick contributes its property's `theme` (a theme key,
 * or a template such as "@element" or "{ability.theme}"), scored by cost + themeWeight.
 * @param {{ def: object, pick: object }[]} resolved
 * @param {object} themes  The vocabulary's themes.
 */
export function themesOf(resolved, themes) {
  return resolved
    .map(({ def, pick }, i) => {
      if (!def.theme) return null;
      const key = String(substitute(def.theme, pick.params ?? {}));
      if (!themes[key]) return null;
      return { key, score: (def.cost ?? 0) + (def.themeWeight ?? 0), i };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((t) => t.key);
}

const lower = (s) => s.toLowerCase();
const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Join a root and a suffix ("Ember" + "fang"); hyphenate where letters would clash ("Ash-hewer"). */
export function joinCompound(root, suffix) {
  const a = lower(root);
  const b = lower(suffix);
  if (a.at(-1) === b[0] || (/[aeiou]$/.test(a) && /^[aeiou]/.test(b))) return `${root}-${b}`;
  return root + b;
}

/** Do two words echo each other ("Ward" and "ward", "Shield" and "shieldwall")? */
const echoes = (a, b) => lower(a).includes(lower(b)) || lower(b).includes(lower(a));

/**
 * An invented word in one of the vocabulary's tongues: start + optional middle + ending,
 * tidied so it stays pronounceable (no triple letters, no doubled vowels at joins, 4–11 letters).
 */
export function inventWord(tongue, rng) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const start = rng.pick(tongue.starts);
    const end = rng.pick(tongue.ends);
    if (echoes(start, end)) continue; // no "Grimgrim"
    let w = start;
    if (rng.next() < 0.45) w = joinSyllable(w, rng.pick(tongue.middles));
    w = joinSyllable(w, end);
    w = w.replace(/(.)\1\1+/gi, "$1$1");
    if (w.length >= 4 && w.length <= 11) return capital(lower(w));
  }
  return capital(lower(rng.pick(tongue.starts) + rng.pick(tongue.ends)));
}

function joinSyllable(a, b) {
  const x = a.at(-1)?.toLowerCase();
  const y = b[0]?.toLowerCase();
  if (x && x === y) return a + b.slice(1);
  if (/[aeiou]/.test(x) && /[aeiou]/.test(y) && rng0(a, b)) return a + b.slice(1);
  return a + b;
}
// Deterministic tie-break for vowel pile-ups that doesn't need the stream (keeps names stable).
const rng0 = (a, b) => (a.length + b.length) % 2 === 0;

function weightedKey(table, rng) {
  return rng.weighted(Object.entries(table).map(([key, weight]) => ({ key, weight })))?.key;
}

/**
 * Generate a true name.
 * @param {object} args
 * @param {string[]} args.themes      Theme keys, strongest first (may be empty: the "hero" theme is used).
 * @param {string} args.form          A key into vocab.forms.
 * @param {string} args.rarity
 * @param {object} args.vocab         { themes, forms, tongues, tongueWeights }
 * @param {Rng} args.rng
 */
export function generateTrueName({ themes, form, rarity, vocab, rng }) {
  const T1 = vocab.themes[themes[0]] ?? vocab.themes.hero;
  const T2 = vocab.themes[themes[1]] ?? vocab.themes[themes[0]] ?? vocab.themes.hero;
  const F = vocab.forms[form] ?? vocab.forms.blade;
  const tongueTable = vocab.tongueWeights?.[form] ?? vocab.tongueWeights?.[themes[0]] ?? vocab.tongueWeights?.default ?? {};
  const tongue = () => vocab.tongues[weightedKey(tongueTable, rng.fork("tongue")) ?? Object.keys(vocab.tongues)[0]];

  let usedNoun = null;
  const compound = (t = T1) => {
    const suffix = rng.fork("suffix").pick(F.suffixes);
    const roots = t.roots.filter((r) => !echoes(r, suffix));
    const word = joinCompound(rng.fork("root").pick(roots.length ? roots : t.roots), suffix);
    usedNoun = suffix;
    return word;
  };
  const possessive = (t = T1) => {
    const nouns = F.nouns.filter((n) => !usedNoun || !echoes(n, usedNoun));
    return `${rng.fork("figure").pick(t.figures)} ${rng.fork("noun").pick(nouns.length ? nouns : F.nouns)}`;
  };
  const single = () => rng.fork("single").pick(T1.singles);
  const invented = () => inventWord(tongue(), rng.fork("invent"));

  const table = PATTERNS[rarity] ?? PATTERNS.rare;
  switch (weightedKey(table, rng.fork("pattern"))) {
    case "compound": return compound();
    case "possessive": return possessive();
    case "single": return single();
    case "invented": return invented();
    case "titled": return `${invented()}, the ${compound()}`;
    case "compoundEpithet": { const c = compound(); return `${c}, ${possessive(T2)}`; }
    case "inventedEpithet": return `${invented()}, ${possessive(T2)}`;
    default: return compound();
  }
}

/** Unidentified appearance: "Frost-Rimed Longsword", or "Longsword with a subtle aura of menace". */
export function unidentifiedLook({ theme, baseName, vocab, rng }) {
  const T = vocab.themes[theme] ?? vocab.themes.hero;
  const aura = rng.fork("aura").pick(T.auras);
  const name = aura.startsWith("with ") && rng.fork("aura-name").next() < 0.5
    ? `${baseName} ${aura}`
    : `${rng.fork("look").pick(T.looks)} ${baseName}`;
  return { name, description: `<p><em>${baseName}, ${aura}.</em></p>` };
}

/**
 * Everything about an item's names.
 * @param {object} args
 * @param {object} args.recipe        Uses recipe.naming: { mode: "auto"|"true"|"descriptive"|"custom", custom, rerolls }.
 * @param {string} args.baseName
 * @param {string} args.descriptive   The long descriptive name ("Keen Flaming Longsword +1").
 * @param {{def, pick}[]} args.resolved
 * @param {string[]} args.categories
 * @param {object|null} args.vocab    Without a vocabulary, items keep their descriptive names.
 * @param {string} [args.minRarity]   Lowest rarity that gets a true name in "auto" mode.
 * @returns {{ name: string, trueName: string|null, descriptive: string, mode: string, usesTrueName: boolean,
 *             unidentified: { name: string, description: string } }}
 */
export function nameItem({ recipe, baseName, descriptive, resolved, categories, vocab, minRarity = "rare" }) {
  const naming = recipe.naming ?? {};
  const mode = naming.mode ?? "auto";
  const plainUnidentified = { name: baseName, description: "" };
  if (!vocab?.themes || !vocab?.forms) {
    return { name: naming.custom?.trim() || descriptive, trueName: null, descriptive, mode, usesTrueName: false, unidentified: plainUnidentified };
  }
  const themes = themesOf(resolved, vocab.themes);
  const rng = new Rng(`${recipe.seed}/name/${naming.rerolls ?? 0}`);
  const trueName = generateTrueName({ themes, form: formOf(categories), rarity: recipe.rarity, vocab, rng: rng.fork("true") });
  const unidentified = unidentifiedLook({ theme: themes[0] ?? "hero", baseName, vocab, rng: rng.fork("unidentified") });

  let name = descriptive;
  if (mode === "custom" && naming.custom?.trim()) name = naming.custom.trim();
  else if (mode === "true" || (mode === "auto" && rank(recipe.rarity) >= rank(minRarity))) name = trueName;
  return { name, trueName, descriptive, mode, usesTrueName: name === trueName, unidentified };
}
