# v0.4 Lifecycle Package QIF Check

Date: 2026-07-13
Task: TASK-101
Result: PASS

## Completion criteria

- PASS: `@archmap/lifecycle` is an Apache-2.0 workspace package with an independent TypeScript build and `@archmap/core` peer dependency.
- PASS: the package exports Requirement, AcceptanceCriterion, Decision, Risk, Test, Evidence, LifecycleRelation, and the standard lifecycle status vocabularies.
- PASS: the default plugin registers seven element definitions, eleven typed relations, a validator extension point, and Requirements, Traceability, and Quality view definitions in one operation.
- PASS: both `createArchMap().use(lifecycle)` and `installLifecycle()` are supported without importing lifecycle vocabulary into Core.

## Success criteria

- PASS: repeated installation of the same plugin version is idempotent; conflicting registration remains governed by the Core registry.
- PASS: focused tests cover isolated and default-instance installation and registered-view rendering.
- PASS: the packed Core and Lifecycle tarballs install together in an isolated consumer and execute through Node ESM.
- PASS: package dry-run exposes only `dist`, README, LICENSE, and package metadata; the lifecycle package is approximately 4 kB packed.
- PASS: `npm test` reports 19 files and 255 tests passing; typecheck and both production builds succeed.

## Evidence

- `packages/lifecycle/src/types.ts`
- `packages/lifecycle/src/vocabulary.ts`
- `packages/lifecycle/src/index.ts`
- `packages/lifecycle/src/views.ts`
- `test/lifecycle-plugin.test.ts`
- isolated tarball consumer output: `consumer ESM OK`

## QIF intent and loss boundary

- Quality intent: make lifecycle semantics opt-in as one coherent Schema + Relations + Validation + Views plugin.
- Protected boundary: Core must remain architecture-domain neutral and existing v0.3 documents must retain behavior.
- Loss avoided: consumers do not need to install unrelated lifecycle concepts, and lifecycle package failures cannot mutate unrelated `createArchMap()` instances.

## Residual scope

- Plugin-owned YAML sections are not parsed yet; TASK-102 adds parsing and normalization.
- The registered lifecycle validator is an extension point only; TASK-103 adds actionable lifecycle diagnostics.
- The three views are intentionally preliminary projections; TASK-105 completes relation-aware Requirements, Traceability, and Quality rendering.
- Browser CDN publication is not part of this task; the package exposes a browser-compatible ESM entry and its source/default installation path is covered.
