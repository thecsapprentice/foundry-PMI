# Procedural Magic Items

A Foundry VTT **v12** module for the **dnd5e 4.4.x** system that generates magic items through a DM-guided builder. Generated items use real dnd5e mechanics (activities, Active Effects, charges and magical bonuses) instead of descriptions the DM has to adjudicate by hand.

**Status:** early development. The builder window opens, but doesn't create items yet.

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

As a GM, open the **Items** sidebar and click **Magic Item Builder**.

## What PMI changes in your world

PMI currently writes nothing to your world. The builder only opens a window, and drafts live in that window until you close it.

As features land, this section will list every kind of document PMI can change. The planned limits are:

- PMI only creates and updates **items it generated**, identified by PMI's own data, never by name.
- New items are created by a GM, with default ownership **None**, in a PMI folder, so players can't see them until you share them.
- PMI never deletes actors, scenes, journals, tables, macros or folders, and never changes permissions on existing documents.

**Disabling the module.** Generated items will stay ordinary, valid dnd5e items. Automated triggers that need PMI's code simply stop working.

**Before installing any new module,** make a backup: Foundry's Setup screen → **Worlds** → *Backup* in v12.

## Development

```
python3 tools/build.py --repo thecsapprentice/foundry-pmi --version X.Y.Z   # module.json + dist/foundry-pmi.zip
node tests/run.mjs                                                         # tests
python3 tools/audit.py                                                     # world-safety audit
```

See `CLAUDE.md` for the full pre-commit checklist.
