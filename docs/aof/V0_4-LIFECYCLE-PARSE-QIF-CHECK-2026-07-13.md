# v0.4 Lifecycle Parse QIF Check

Date: 2026-07-13
Task: TASK-102
Result: PASS

## Completion criteria

- PASS: installed element registrations drive parsing of `requirements`, `acceptanceCriteria`, `decisions`, `risks`, `tests`, and `evidence`; registered relation vocabulary enables `relations` normalization.
- PASS: lifecycle records retain domain attributes and `extensions`; parser origin is recorded separately as `provenance` so a domain `source` attribute is not overwritten.
- PASS: unknown plugin sections remain inert under `model.extensions.sections` and receive `plugin_required` rather than being interpreted by Core.
- PASS: relation endpoints resolve deterministically to lifecycle or architecture kinds, and generated relation IDs remain stable.
- PASS: `serializeLifecycle()` emits deterministic, sorted lifecycle JSON without view-specific state.

## Success criteria

- PASS: AC-02 is covered by installed-plugin YAML parse tests.
- PASS: AC-10 is covered by the public `lifecycleJson()` and `serializeLifecycle()` output API.
- PASS: AC-11 is covered by explicit and generated stable-ID assertions across repeated parses.
- PASS: Core-only parsing preserves lifecycle-shaped metadata but does not claim lifecycle semantics.
- PASS: existing architecture parsing/rendering remains green across the complete regression suite.

## Evidence

- `src/extensions.ts`
- `src/plugin.ts`
- `src/types.ts`
- `packages/lifecycle/src/serialize.ts`
- `test/plugin.test.ts`
- `test/lifecycle-plugin.test.ts`
- `npm run typecheck`
- `npm test`: 19 files, 257 tests passed
- `npm run build`
- `npm run build:lifecycle`

## QIF intent and loss boundary

- Quality intent: lifecycle semantics become available only after installing their schema plugin, while normalized output stays deterministic and queryable.
- Protected boundary: Core owns generic registration and normalization mechanics but contains no Requirement, Risk, Test, or Evidence vocabulary.
- Loss avoided: unknown metadata is retained for a future plugin; business `source` data is not destroyed by parser provenance; legacy v0.3 documents retain behavior.

## Residual scope

- Structural and traceability gap diagnostics are TASK-103.
- Relation-aware query/trace APIs are TASK-104.
- Requirements, Traceability, and Quality views remain preliminary until TASK-105.
