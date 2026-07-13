# v0.4 Lifecycle Views QIF Check

Date: 2026-07-13
Task: TASK-105
Result: PASS

## Completion criteria

- PASS: Requirements View projects requirement hierarchy, status, priority, owner, acceptance criteria, and explicitly allocated architecture elements.
- PASS: Traceability View expands from a selected stable ID with direction, relation type, lifecycle type, status, owner, and depth filters.
- PASS: Quality View projects only Requirement, Acceptance Criterion, Test, and Evidence records and displays verification result and evidence freshness.
- PASS: all three views render filtered canonical graph projections instead of cloning or mutating the model.

## Success criteria

- PASS: AC-07 is covered by Requirements View hierarchy, metadata, inferred acceptance linkage, and architecture allocation assertions.
- PASS: AC-08 is covered by Quality View status, result, freshness, and exclusion assertions.
- PASS: AC-09 is covered by rendering Overview, Requirements, and Quality from the same canonical model.
- PASS: lifecycle connectors are orthogonal; source and target segments enter card sides perpendicularly, including same-column hierarchy routes.

## Evidence

- `packages/lifecycle/src/views.ts`
- `packages/lifecycle/src/vocabulary.ts`
- `src/render.ts`
- `test/lifecycle-views.test.ts`
- focused lifecycle tests: 10 passed
- `npm run typecheck`
- `npm run build`
- `npm run build:lifecycle`
- `npm test`: 21 files, 268 tests passed

## QIF intent and loss boundary

- Quality intent: each lifecycle view must communicate one purpose without silently widening into the complete lifecycle or architecture graph.
- Protected boundary: Core carries opaque per-view options and generic graph/query primitives; lifecycle vocabulary, inferred domain links, projections, and presentation remain in `@archmap/lifecycle`.
- Loss avoided: stable IDs survive projection, architecture views remain independent, missing explicit Acceptance/Evidence relations can be visualized from their canonical reference fields, and unrelated records do not leak into view output.

## Residual scope

- The login Requirement -> Acceptance -> Architecture -> Test -> Evidence browser sample, controls, docs, and complete AC-01..AC-12 matrix are TASK-106.
- Coverage and readiness calculation remain TASK-107 and later quality-package work.
