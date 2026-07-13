# v0.4 Lifecycle Vertical Slice QIF Check

Date: 2026-07-14
Task: `.aof/tasks/done/TASK-106.json`

## Quality intent

The lifecycle views must help a reader answer three different questions from
one canonical model:

- Requirements: what must be true, and which architecture elements fulfill it?
- Traceability: what is connected to the selected lifecycle path?
- Quality: what criterion, test, and evidence prove each requirement?

## Loss boundaries

The slice is not successful if it renders but creates any of these readings:

- one requirement appears to prove the complete Topology;
- unrelated architecture nodes appear in a selected trace;
- acceptance cards expose only opaque IDs;
- internal relation vocabulary is presented without reader-facing language;
- long titles escape their component regions.

## Evidence

- `src/samples.ts` supplies four independent checkout lifecycle chains:
  sign-in, order persistence, payment, and observability.
- `packages/lifecycle/src/views.ts` gives each projection an explicit reading
  guide, wraps long titles, displays criterion statements, humanizes relation
  labels, and removes disconnected elements from Traceability.
- `test/lifecycle-views.test.ts` fixes these behaviors as DOM/SVG regressions.
- `docs/V0_4_ACCEPTANCE_MATRIX.md` maps AC-01 through AC-12 to executable
  evidence and records the demo coverage boundary.

## Verification

- `npm run typecheck`: pass
- `npm test`: 21 files, 270 tests pass
- `npm run build`: Core, extras, declarations, and `@archmap/lifecycle` pass
- AOF `organization-verify`: 46/46 pass

## Decision

Completion: pass. The login vertical slice, docs, toolbar integration, sample
coverage, and acceptance matrix are present.

Success: pass for the v0.4 MVP slice. The views now communicate bounded
projections rather than implying whole-system completeness. Broader readiness,
coverage metrics, scale benchmarks, and release policy remain under TASK-107.
