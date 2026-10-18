// Constants shared by the pure core and the Foundry-facing code. No Foundry globals here.

export const MODULE_ID = "foundry-pmi";

/** Bumped when the shape of a stored recipe changes, so later versions can migrate old items. */
export const RECIPE_VERSION = 1;

/** Rarity keys match dnd5e's CONFIG.DND5E.itemRarity keys, lowest first. */
export const RARITIES = ["common", "uncommon", "rare", "veryRare", "legendary", "artifact"];

/**
 * Power budget and property cap per rarity. A whole budget roughly equals one DMG item of that rarity:
 * a +1 weapon (cost 3) fills an uncommon budget, a +2 weapon (cost 6) a rare one, a +3 weapon (cost 10) a very rare one.
 */
export const RARITY_RULES = {
  common:    { budget: 1,  maxProperties: 1, saveDC: 11, price: 50 },
  uncommon:  { budget: 3,  maxProperties: 2, saveDC: 13, price: 400 },
  rare:      { budget: 6,  maxProperties: 3, saveDC: 15, price: 4000 },
  veryRare:  { budget: 10, maxProperties: 4, saveDC: 17, price: 40000 },
  legendary: { budget: 15, maxProperties: 5, saveDC: 18, price: 200000 },
  artifact:  { budget: 20, maxProperties: 6, saveDC: 19, price: 500000 },
};

/** Property slots, in the order names are built, with how many of each one item may have. */
export const SLOTS = ["enhancement", "prefix", "suffix", "spell", "persona", "curse"];
export const SLOT_LIMITS = { curse: 2, enhancement: 1, prefix: 2, suffix: 1, spell: 3, persona: 1 };

/**
 * Drawbacks live in the "curse" slot. Their cost is zero or negative: each one gives budget back, so a cursed
 * item can carry a stronger blessing. They don't count towards the rarity's property cap, and the random roll
 * only adds one by chance (the "drawback chance" setting), never by weight alongside the other properties.
 */
export const CURSE_SLOT = "curse";

/**
 * Power limits, unless a GM sets their own in the module settings:
 *   tier          numbers that grow with rarity ({ byRarity }) stop growing at this rarity
 *   abilityScore  the highest score an ability-score property may set
 *   bonus         the highest flat bonus (+N to AC, saves, attacks, spell DCs, enhancement)
 */
export const DEFAULT_LIMITS = { tier: "veryRare", abilityScore: 23, bonus: 3 };

/** How likely a random roll is to add one drawback, unless a GM sets their own chance. */
export const DEFAULT_CURSE_CHANCE = 0.15;

/** Item types the generator supports so far. */
export const SUPPORTED_ITEM_TYPES = ["weapon", "equipment"];

/** Equipment `system.type.value`s that count as wands and rods. Staves are quarterstaffs that are spellcasting foci. */
export const WAND_TYPES = ["wand"];
export const ROD_TYPES = ["rod"];

/** Equipment `system.type.value`s that count as armor or shields. */
export const ARMOR_TYPES = ["light", "medium", "heavy"];
export const SHIELD_TYPES = ["shield"];

/** Foundry's ACTIVE_EFFECT_MODES, by name, so property files can say "add" instead of 2. */
export const EFFECT_MODES = { custom: 0, multiply: 1, add: 2, downgrade: 3, upgrade: 4, override: 5 };

/** How often each rarity comes up on the builder's random-rarity button. Common and artifact are never random. */
export const RARITY_WEIGHTS = { uncommon: 40, rare: 30, veryRare: 20, legendary: 10 };

/** Base-item compendiums used until a GM picks their own in the module settings. */
export const DEFAULT_BASE_PACKS = ["dnd5e.items", "dnd5e.equipment24"];

/** Spell compendiums used until a GM picks their own in the module settings. */
export const DEFAULT_SPELL_PACKS = ["dnd5e.spells", "dnd5e.spells24"];

/** Kinds of base item, most specific first (a staff is also a weapon). The random-base buttons use these. */
export const BASE_KINDS = ["staff", "tome", "wand", "rod", "worn", "shield", "armor", "weapon"];

/**
 * Kinds that are a reskin of another: a tome is a wand in book form. It has its own button and names, but
 * takes the same properties (it is also categorised "wand"), charge pool and spell costs.
 */
export const KIND_PARENT = { tome: "wand" };

/** Equipment types a worn wondrous item can have. */
export const WORN_TYPES = ["ring", "trinket", "clothing", "wondrous"];

/**
 * Equipment identifiers (dnd5e's `system.identifier`) that mark a base item's kind and body slot, for
 * items whose type alone doesn't say: PMI's built-in bases, and the 2024 compendium's Wand and Rod,
 * which are plain "trinket" equipment.
 */
export const IDENTIFIER_CATEGORIES = {
  wand: ["wand"],
  tome: ["tome", "wand"], grimoire: ["tome", "wand"], spellbook: ["tome", "wand"],
  rod: ["rod"],
  ring: ["worn", "ring"],
  amulet: ["worn", "neck"], necklace: ["worn", "neck"], pendant: ["worn", "neck"],
  cloak: ["worn", "cloak"], cape: ["worn", "cloak"],
  boots: ["worn", "feet"],
  gloves: ["worn", "hands"], gauntlets: ["worn", "hands"],
  belt: ["worn", "waist"],
  bracers: ["worn", "wrists"],
  circlet: ["worn", "head"], headband: ["worn", "head"],
};

/** Items of this rarity and up get a true name ("Emberfang") instead of the descriptive one, unless the DM chooses. */
export const TRUE_NAME_MIN_RARITY = "rare";

/** UUID-like prefix for PMI's built-in base items (they live in data/bases/, not in a compendium). */
export const BUILTIN_BASE_PREFIX = "pmi-base:";

/**
 * The charge pool a spell property creates when the item has none yet, by base kind (DMG-style:
 * wands 7 charges regaining 1d6+1 at dawn, staves 10 regaining 1d6+4).
 */
export const CHARGE_POOLS = {
  wand: { max: 7, formula: "1d6 + 1" },
  staff: { max: 10, formula: "1d6 + 4" },
  rod: { max: 5, formula: "1d4 + 1" },
  worn: { max: 3, formula: "1d3" },
  default: { max: 3, formula: "1d3" },
};
