# Procedural Magic Items

A Foundry VTT **v12** module for the **dnd5e 4.4.x** system that generates magic items through a DM-guided builder. Generated items use real dnd5e mechanics (activities, Active Effects, charges and magical bonuses) instead of descriptions the DM has to adjudicate by hand.

**Status:** early development. Weapons, armor and shields work; wondrous items, wands and staves come later.

## Requirements

- Foundry VTT v12
- dnd5e 4.4.x
- [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper)

## Installation

In Foundry's Setup screen, go to **Add-on Modules → Install Module** and paste this manifest URL:

```
https://raw.githubusercontent.com/thecsapprentice/foundry-pmi/main/module.json
```

## Usage

1. As a GM, open the **Items** sidebar and click **Magic Item Builder**.
2. Choose a mundane weapon, armor or shield from the list, or drop one onto the window from the sidebar or a compendium.
3. Pick a rarity and click **Roll**. Each property can be locked (kept on the next roll), replaced, have its details rerolled (for example a different element), or removed. You can also add properties by hand; the budget bar warns if you overspend, but doesn't stop you.
4. Check the preview, then click **Create item**. The item appears in the *Procedural Magic Items* folder, visible only to GMs until you share it.

To make a variation of an item you created, right-click it in the Items sidebar and choose **Open in Magic Item Builder**. Creating from there makes a new item; the original is never changed.

## What PMI changes in your world

PMI only changes what's listed here. It uses Foundry's normal document API, so every change goes through Foundry's own validation and permission checks.

| What | When | What changes |
|---|---|---|
| **New items** | A GM clicks *Create item* | One new item, after it passes dnd5e's data validation. Default ownership is **None**, so players can't see it until you share it. It carries its recipe in `flags.foundry-pmi.recipe`. |
| **PMI's folder** | The first *Create item* | One Item folder, *Procedural Magic Items*, marked with `flags.foundry-pmi.generated`. PMI finds it by that flag, never by name, so renaming it is fine. |

PMI never edits or deletes existing items (including the ones it made), actors, scenes, journals, tables, macros or folders, and never changes permissions. Players can't open the builder.

**Disabling the module.** Generated items are ordinary dnd5e items: magical bonuses, attack activities with extra damage, save activities, charges and Active Effects all keep working without PMI. Only the builder and the right-click entry go away.

**Before installing any new module,** make a backup: Foundry's Setup screen → **Worlds** → *Backup* in v12.

## Property files

Properties live in `data/properties/*.json`. Each has an `id`, a `slot` (`enhancement`, `prefix` or `suffix`), a `cost` against the rarity's budget, a `weight` for random picks, the categories it `appliesTo` (`weapon`, `weapon.melee`, `armor.heavy`, `shield`, …), optional `minRarity`/`maxRarity`, an `exclusive` group, `attunement`, `params`, `changes` and `text`.

Change types so far: `magicalBonus`, `itemField`, `activityDamage`, `attackCritical`, `effect`, `uses` and `saveActivity`. Other modules can add properties and change types through `game.modules.get("foundry-pmi").api` in the `foundry-pmi.ready` hook.

| Rarity | Budget | Max properties | Save DC |
|---|---|---|---|
| Uncommon | 3 | 2 | 13 |
| Rare | 6 | 3 | 15 |
| Very rare | 10 | 4 | 17 |
| Legendary | 15 | 5 | 18 |

## Development

```
python3 tools/build.py --repo thecsapprentice/foundry-pmi --version X.Y.Z   # module.json + dist/foundry-pmi.zip
node tests/run.mjs                                                         # tests
python3 tools/audit.py                                                     # world-safety audit
```

See `CLAUDE.md` for the full pre-commit checklist.
