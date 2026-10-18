# Procedural Magic Items

A Foundry VTT **v12** module for the **dnd5e 4.4.x** system that generates magic items through a DM-guided builder. Generated items use real dnd5e mechanics (activities, Active Effects, charges and magical bonuses) instead of descriptions the DM has to adjudicate by hand.

**Status:** early development. Weapons, armor, shields, wands, staves, rods and worn wondrous items (rings, amulets, cloaks, boots, gloves, belts, bracers, circlets) work.

## Requirements

- Foundry VTT v12
- dnd5e 4.4.x
- [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper)

## Installation

In Foundry's Setup screen, go to **Add-on Modules → Install Module** and paste this manifest URL:

```
https://raw.githubusercontent.com/thecsapprentice/foundry-PMI/main/module.json
```

## Usage

1. As a GM, open the **Items** sidebar and click **Magic Item Builder** (or use **Configure Settings → Procedural Magic Items → Open Magic Item Builder**, for example if another module changes the sidebar).
2. Click a kind button (*Any*, *Weapon*, *Armor*, *Shield*, *Wondrous*, *Staff*, *Wand*, *Rod*) for a random base of that kind, choose a specific one from the list, or drop one onto the window from the sidebar or a compendium.
3. Pick a rarity (or click the dice for a random one, weighted toward lower rarities) and click **Roll** in the sidebar. Roll rerolls every unlocked property. Properties appear as cards. Each can be locked (kept on the next roll), replaced, have its details rerolled (for example a different element), or removed. You can also add properties by hand; the budget bar warns if you overspend, but doesn't stop you.
4. Check the preview in the sidebar, then click **Create item**. It's enabled once the item has at least one property. The item appears in the *Procedural Magic Items* folder, visible only to GMs until you share it.

**True names.** Rare and rarer items get a true name drawn from their strongest property and what they are: *Duskbite* (a necrotic longsword), *Updraft* (winged boots), *Giant's Edge*, and at very rare and legendary, an invented word with an epithet such as *Veribur, the Graveroot*. The full descriptive name (*Withering Longsword +1*) leads the item's description. Beside the name in the preview, the dice rolls a new name, the tag switches between the true and descriptive names, and the pen lets you type your own. Before an item is identified, players see a hint of it instead, such as *Frost-Rimed Longsword* or *Longsword with a subtle aura of menace*. Name vocabulary lives in `data/names/names.json`.

**Triggers.** Some properties happen by themselves in play. On a critical hit: *of Staggering* (Con save or stunned), *Blinding* (Con save or blinded), *Bloodthirsty* (temporary HP). On a kill: *Reaping* (heal), *Exultant* (+2 to hit and +10 ft. speed until your next turn), *Hungering* (regain a charge). Drawbacks use three more: on a hit (when the weapon's attack rolls damage), on a natural 1, and at dawn (when its bearer finishes a long rest that starts a new day). Each is a normal dnd5e activity on the item, marked *Special* with its condition written on it. PMI uses it automatically when the event happens, which posts dnd5e's usual chat card, and you apply damage, healing or conditions with dnd5e's own buttons. Kills are counted when damage is applied with dnd5e's apply-damage buttons on the weapon's own damage roll, and need libWrapper. Without PMI, players can still use these activities by hand.

**Sapient weapons.** Very rare and legendary weapons can roll *Sapient*: a personality, a voice, a quirk, an alignment, mental scores and a purpose. Purposes that name a target roll it from a list, so *Slay all [people] it meets* might be elves, dwarves or dragonborn, and *Destroy all [objects] it finds* might be chests, doors or artworks. Very rare weapons communicate by empathy; legendary ones speak and see in the dark. When the weapon's desires conflict with its wielder's, its *Conflict of Wills* activity calls for a Wisdom save against the item's DC.

**Drawbacks.** An item can carry up to two drawbacks, such as a lowered ability score, slower speed, a noise that never stops (disadvantage on Stealth), lost darkvision, spines that bite the wielder on a hit, four times the weight, a will of its own that must be coaxed each dawn, or never having advantage or disadvantage. Each gives budget back, so a cursed item can carry more or stronger properties, and drawbacks don't count towards the rarity's property limit. A random roll adds one by chance (*Drawback chance* in the module settings, 15% by default), and the **Drawback** button beside *Add* adds one by hand. Every drawback uses dnd5e's own mechanics: Active Effects, item fields, and activities PMI uses at the right moment (a hit, a natural 1, or dawn after a long rest).

**Power limits.** Under **Configure Settings → Procedural Magic Items**, *Strongest effects* sets the rarity at which numbers stop growing (very rare by default, so a legendary belt sets Strength to 23 rather than 25), *Highest ability score* caps scores outright, and *Highest flat bonus* caps +N bonuses, including +1/+2/+3 enhancements. Rarer items still get a bigger budget and more properties. Changes apply to new rolls; created items keep their numbers.

**Unidentified items.** The *Created identified* button above *Create item* switches to *Created unidentified*, so players see only the item's plain look until you identify it.

**Wands, staves and rods** get spells they can cast from charges, using dnd5e's own Cast activity: the spell is cast at a fixed save DC and attack bonus set by the item's rarity, without components, and each extra charge raises its level. The item's charge pool follows the DMG: wands hold 7 charges and regain 1d6 + 1 at dawn, staves 10 and regain 1d6 + 4. A wand spends 1 charge per spell; a staff or rod spends charges equal to the spell's level. Staves are also quarterstaffs, so they can roll weapon properties too.

**Worn wondrous items** start from PMI's own built-in bases (ring, amulet, cloak, boots, gloves, belt, bracers, circlet, plus a wand and a rod), which are always in the base list. They can roll save bonuses, resistances, speed, darkvision, protection, advantage on a skill, a set ability score (like a belt of giant strength), spells cast from charges, and once-a-day powers such as flight, invisibility or a ward. A power is a normal dnd5e activity on the item: the wearer uses it, and the effect it applies to them lasts its set time. Properties favour fitting slots, so boots roll speed and flight more often than rings do. Mundane rings, amulets and the like from your own compendiums work too, when dnd5e's identifier says what they are.

**Choosing spell sources.** Spells come from the dnd5e system's spell compendiums by default. To use another book's spells, such as the Player's Handbook, go to **Configure Settings → Procedural Magic Items → Spell sources**. Items you've already created keep their spells.

**Choosing base item sources.** By default the builder lists bases from the dnd5e system's item compendiums. To change that, go to **Configure Settings → Procedural Magic Items → Base item sources** and tick the compendiums you want. Only compendiums with mundane weapons, armor, shields, wands, staves or rods are listed.

To make a variation of an item you created, right-click it in the Items sidebar and choose **Open in Magic Item Builder**. Creating from there makes a new item; the original is never changed.

## What PMI changes in your world

PMI only changes what's listed here. It uses Foundry's normal document API, so every change goes through Foundry's own validation and permission checks.

| What | When | What changes |
|---|---|---|
| **New items** | A GM clicks *Create item* | One new item, after it passes dnd5e's data validation. Default ownership is **None**, so players can't see it until you share it. It carries its recipe in `flags.foundry-pmi.recipe`. |
| **World setting** `foundry-pmi.basePacks` | A GM saves *Base item sources* | The list of compendium ids the builder offers bases from. |
| **World setting** `foundry-pmi.spellPacks` | A GM saves *Spell sources* | The list of compendium ids spell properties pick from. |
| **World settings** `foundry-pmi.powerTier`, `maxAbilityScore`, `maxBonus`, `curseChance` | A GM changes them in *Configure Settings* | How strong rolled properties can be, and how often a roll adds a drawback. |
| **Chat messages** | A trigger fires in play | PMI's own message when *Hungering* restores charges. Other triggers (including a drawback's self-damage or its dawn check) use dnd5e's own chat cards; people apply the results with dnd5e's buttons. |
| **A PMI item's charges** | A *Hungering* weapon gets a kill | That item's own spent charges go down. PMI never applies damage, healing or conditions itself: people do, with dnd5e's buttons. |
| **PMI's folder** | The first *Create item* | One Item folder, *Procedural Magic Items*, marked with `flags.foundry-pmi.generated`. PMI finds it by that flag, never by name, so renaming it is fine. |

Apart from restoring a PMI item's own charges, PMI never edits or deletes existing items, actors, scenes, journals, tables, macros or folders, and never changes permissions. Players can't open the builder.

**Disabling the module.** Generated items are ordinary dnd5e items: magical bonuses, attack activities with extra damage, save activities, charges and Active Effects all keep working without PMI. Only the builder and the right-click entry go away.

**Before installing any new module,** make a backup: Foundry's Setup screen → **Worlds** → *Backup* in v12.

## Property files

Properties live in `data/properties/*.json`. Each has an `id`, a `slot` (`enhancement`, `prefix`, `suffix`, `spell`, `persona` or `curse`), a `cost` against the rarity's budget (zero or negative for a `curse`, which gives budget back), a `weight` for random picks, the categories it `appliesTo` (`weapon`, `weapon.melee`, `armor.heavy`, `shield`, …), an optional `menuLabel` (for the Add menu), `theme` and `themeWeight` (for true names), optional `minRarity`/`maxRarity`, `notFor` (categories it never applies to, e.g. `weapon.prop.hvy` for heavy weapons), an `exclusive` group, `tags` and one-way `conflicts` (Neutral `conflicts` with anything tagged `rollMode`, but two `rollMode` properties can still share an item), `caps` (how strong it is on a power-limit scale, e.g. `{ "bonus": 3 }`), `requiresSlot` or `requiresCharges` (needs another property that `providesCharges`), `weightBy` (weight multipliers by category, e.g. `{ "feet": 3 }`), `attunement`, `params`, `changes` and `text`.

A property's `name`, and the `name` of a `pick` entry, can be a list of words (`["Keen", "Honed", "Razor-Edged"]`); each item uses one, chosen afresh when the DM rerolls its name. A label that contains the first word follows the chosen one. A `byRarity` parameter with `"cap": "abilityScore"` or `"cap": "bonus"` is held to that power limit.

A `pick` parameter can fill `[key]` placeholders in the picked entry's label from lists in a `fill` object, e.g. `{ "pick": [{ "value": "slay", "label": "Slay all [people] it meets" }], "fill": { "people": ["elves", "dwarves"] } }`.

A parameter can roll a spell: `{ "spell": { "minLevel": 3, "maxLevel": 3, "school": ["evo"], "classes": ["wizard"], "concentration": false } }` picks a matching spell from the chosen spell sources, never one already on the item.

Built-in bases live in `data/bases/builtin.json`.

Change types so far: `magicalBonus`, `itemField`, `activityDamage`, `attackCritical`, `attackBonus`, `effect`, `activate`, `healActivity`, `trigger` (on `crit`, `kill`, `hit`, `fumble` or `dawn`: a Special activity PMI uses automatically, or `restoreCharges`), `damageActivity` (damage, aimed at the user by default), `checkActivity` (an ability or skill check against a DC), `uses`, `usesBonus`, `saveActivity` (damage and/or a condition on a failed save, optionally once per day) and `castSpell` (0 charges for at-will cantrips). Other modules can add bases, properties and change types through `game.modules.get("foundry-pmi").api` in the `foundry-pmi.ready` hook.

| Rarity | Budget | Max properties | Save DC |
|---|---|---|---|
| Uncommon | 3 | 2 | 13 |
| Rare | 6 | 3 | 15 |
| Very rare | 10 | 4 | 17 |
| Legendary | 15 | 5 | 18 |

## Development

```
python3 tools/build.py --repo thecsapprentice/foundry-PMI --version X.Y.Z   # module.json + dist/foundry-pmi.zip
node tests/run.mjs                                                         # tests
python3 tools/audit.py                                                     # world-safety audit
```

See `CLAUDE.md` for the full pre-commit checklist.
