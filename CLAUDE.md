# Procedural Magic Items: instructions for Claude

Procedural Magic Items (PMI, module id `foundry-pmi`) is a Foundry VTT **v12** module for the **dnd5e 4.4.x** system. It generates magic items from property definitions through a DM-guided builder. It runs inside people's campaign worlds, so **protecting world data comes before every feature.** Read this file before changing anything.

## Before EVERY commit: run the safety audit (mandatory)

Do all four steps before every commit, with no exceptions. If any step fails, fix it or stop and tell the user. Never commit around a failure.

1. **Build:** `python3 tools/build.py --repo thecsapprentice/foundry-pmi --version X.Y.Z` (bump the version for any user-facing change).
2. **Tests:** `node tests/run.mjs`. Every check must pass. Add tests for new behaviour, and especially for anything that writes to the world.
3. **Audit:** `python3 tools/audit.py`. It lists every line that can change world data or global behaviour and marks new or changed ones as `NEW`.
   - Review **each** `NEW` site against the checklist below, reading the surrounding code rather than just the one line.
   - Only when every site passes, record the review with `python3 tools/audit.py --accept`, and commit `tools/audit-reviewed.txt` with the change.
   - Never run `--accept` just to make the audit pass.
4. **Report:** in your reply to the user, summarise what the audit flagged and why each new site is safe. If the set of things PMI writes changed, update the README's **"What PMI changes in your world"** section in the same commit.

## World-safety checklist

Check every write site, and the code that reaches it, against these rules:

1. **Only PMI's own data.** Writes may touch only:
   - Items PMI created (see rule 2),
   - PMI's own chat messages,
   - the `foundry-pmi.*` settings,
   - the folder PMI creates for generated items.

   Anything else needs the user's explicit approval first.
2. **Generated-item detection never by name.** An item is a PMI item only if it carries `flags.foundry-pmi.recipe`; use `isPmiItem()`. Never select documents to modify by name alone. Reopening or rerolling an item may only update that item, and only when it passes `isPmiItem()`.
3. **DM review before players see anything.** New items are created with default ownership **None**, in the PMI folder, by a GM. PMI never places items on actors, in player-visible compendiums or in chat for players; distributing items is the DM's job.
4. **No deleting other documents.** Never delete actors, items other than PMI items the DM explicitly discards, scenes, journals, tables, macros, folders or users. Embedded deletions (`-=` keys) may only remove PMI's own keys, activities or effects.
5. **No permission changes.** Never change `ownership` or user roles on existing documents. A document PMI creates may set its own initial ownership.
6. **No bulk operations except the versioned migration.** Loops over `game.actors` or `game.items` may only run in `migrate()`, may only touch `isPmiItem()` items, must be guarded by the `migrationVersion` setting, and must run on the active GM only.
7. **Destructive DM tools confirm first.** Discarding an item, or rerolling an existing item over its current data, needs a confirmation dialog with *No* as the default.
8. **Use the document API only.** No direct file, database, `FilePicker.upload` or server calls. All writes go through `update`, `create`, `delete` or `settings.set`, so Foundry validates them. The single exception is read-only `fetch` of PMI's own files under `modules/foundry-pmi/data/`, done in one helper.
9. **Never store live documents or references in flags.** Copy data (`foundry.utils.deepClone`) before keeping it. `getFlag` returns live objects that later updates change in place.
10. **Wrappers and hooks stay narrow.** Any libWrapper wrapper must call `wrapped(...args)` unchanged for everything that isn't a PMI item with a matching Tier 3 trigger. Hooks must return early for anything that isn't a PMI item.
11. **Permissions are respected.** GM-only tools check `game.user.isGM`. World settings are only written by a GM. Players only update items they own.
12. **Fail safe.** If something unexpected happens, such as a missing base item, property or translator, warn and stop. Never "repair" by guessing which documents to change.
13. **Disabling the module must stay harmless.** Generated items must be valid dnd5e data without PMI: native activities, Active Effects and fields only, with no custom item types, activity types or data models. Tier 3 triggers live in `flags.foundry-pmi` and simply go inert.
14. **Validate before writing.** Compiled item data must pass `new Item.implementation(data)` validation before it is created or used in an update.

## Project layout

| Path | What it is |
|---|---|
| `scripts/main.mjs` | Entry point: hooks, settings, the builder button and the public API. |
| `scripts/config.mjs` | Constants: module id, rarities, budgets, slots. |
| `scripts/api.mjs` | Registries for change types and properties (`registerChangeType`, `registerProperties`). |
| `scripts/generator/` | **Pure** code (no Foundry globals): seeded RNG, parameter resolution, the budget roller. |
| `scripts/compiler/` | **Pure** code: translators from a recipe to dnd5e item data, naming and descriptions. |
| `scripts/apps/` | ApplicationV2 builder UI (GM only). |
| `scripts/runtime/` | Tier 3 trigger hooks and libWrapper wrappers. |
| `data/properties/` | Property definitions (JSON). |
| `templates/`, `styles/`, `lang/` | Handlebars templates, CSS and localization. |
| `tools/build.py` | Writes `module.json` and `dist/foundry-pmi.zip`. |
| `tools/audit.py`, `tools/audit-reviewed.txt` | The world-safety audit and its reviewed baseline. |
| `tests/` | Node test suites. `node tests/run.mjs` runs them all. |

## Conventions

- Keep `generator/` and `compiler/` free of Foundry globals so they can be tested in Node. Pass anything Foundry-specific in through arguments.
- A **recipe** (`{seed, rarity, baseUuid, picks}`) is the source of truth for a generated item and is stored in `flags.foundry-pmi.recipe`.
- The **icons** must exist in Foundry's core icon set or the dnd5e system. Check new icon paths against paths the dnd5e system itself uses before adding them.
- Confirm dnd5e field paths (activity damage parts, `critical.threshold`, Active Effect keys) against the 4.4 data model before relying on them.
- **Commits** end with the attribution lines the session asks for.
