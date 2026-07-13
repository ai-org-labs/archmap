# v0.4 Lifecycle Query and Trace QIF Check

Date: 2026-07-13
Task: TASK-104
Result: PASS

## Completion criteria

- PASS: Core `query()` searches architecture and registered extension elements by stable IDs and generic registered types without lifecycle vocabulary.
- PASS: Core `trace()` traverses architecture edges and extension relations forward, reverse, or both with relation and depth limits.
- PASS: lifecycle wrappers filter extension records by status and owner.
- PASS: elements, relations, paths, and traversal order are deterministic and require neither rendering nor DOM creation.

## Success criteria

- PASS: AC-03 is covered by a Requirement -> Architecture Node -> Test -> Evidence path assertion.
- PASS: focused tests cover one-to-many and many-to-many paths, reverse traversal, cycles, relation filters, and depth limits.
- PASS: complete legacy parse/render behavior remains green.

## Evidence

- `src/query.ts`
- `packages/lifecycle/src/query.ts`
- `test/query.test.ts`
- `npm run typecheck`
- focused query/plugin tests: 16 passed
- `npm test`: 20 files, 263 tests passed
- `npm run build`
- `npm run build:lifecycle`

## QIF intent and loss boundary

- Quality intent: callers can inspect and trace the canonical graph without coupling analysis to a view or browser state.
- Protected boundary: Core operates on generic registered types and relations; lifecycle status/owner semantics stay in the lifecycle package.
- Loss avoided: cycles terminate per path, maximum depth is enforced, reverse lookup is first-class, and stable ordering keeps Git/AI output reproducible.

## Residual scope

- Requirements, Traceability, and Quality projections and rendering are TASK-105.
- Large-model indexing and partial loading remain later v0.4/v0.7 scale work.
