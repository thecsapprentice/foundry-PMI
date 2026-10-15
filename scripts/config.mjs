// Constants shared by the pure core and the Foundry-facing code. No Foundry globals here.

export const MODULE_ID = "foundry-pmi";

/** Rarity keys match dnd5e's CONFIG.DND5E.itemRarity keys. */
export const RARITIES = ["common", "uncommon", "rare", "veryRare", "legendary", "artifact"];

/** Power budget and property cap per rarity. Placeholders to tune against DMG items. */
export const RARITY_RULES = {
  common:    { budget: 1,  maxProperties: 1 },
  uncommon:  { budget: 3,  maxProperties: 2 },
  rare:      { budget: 6,  maxProperties: 3 },
  veryRare:  { budget: 10, maxProperties: 4 },
  legendary: { budget: 15, maxProperties: 5 },
  artifact:  { budget: 20, maxProperties: 6 },
};

/** Property slots, in the order the roller fills them. */
export const SLOTS = ["enhancement", "prefix", "suffix"];

/** Item types the generator supports so far. */
export const SUPPORTED_ITEM_TYPES = ["weapon", "equipment"];
