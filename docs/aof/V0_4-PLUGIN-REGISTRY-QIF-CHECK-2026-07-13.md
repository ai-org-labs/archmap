# v0.4 Plugin Registry QIF Check

Date: 2026-07-13
Task: TASK-100
Result: PASS

## Completion criteria

- PASS: `createArchMap()` creates isolated plugin registries and `use()` installs versioned plugins.
- PASS: the default instance shares the legacy top-level view registry, so `use(plugin)` remains compatible with top-level `render()`.
- PASS: element type, relation type, validator, and instance view registration APIs are public.
- PASS: generic extension elements and relations are retained on compatibility and canonical models without lifecycle vocabulary in Core.
- PASS: dependency ranges, conflicts, duplicate plugin versions, duplicate definitions, cleanup, and uninstall are checked.
- PASS: additive registry paths exist for overlays, policies, serializers, importers, exporters, and themes.

## Success criteria

- PASS: `npm test` reports 18 files and 251 tests passing.
- PASS: focused plugin tests prove two instances do not leak types, validators, or views.
- PASS: `npm run typecheck` and `npm run build` succeed.
- PASS: Core contains no import from a lifecycle package or lifecycle implementation directory.

## Evidence

- `src/plugin.ts`
- `src/types.ts` (`ExtensionElement`, `ExtensionRelation`, `ExtensionGraph`)
- `src/render.ts` (instance-selectable view registry)
- `src/canonical.ts` (extension graph retention)
- `test/plugin.test.ts` (5 focused tests)

## Residual scope

- Plugin-owned YAML section parsing and normalization begin in TASK-102.
- Lifecycle schema, relation vocabulary, validators, and views belong to `@archmap/lifecycle` in TASK-101 and later tasks.
- Registry paths other than element, relation, validator, and view are intentionally registration foundations only in TASK-100.
