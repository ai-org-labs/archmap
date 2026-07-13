# v0.4 Lifecycle component-safe trace path QIF check

Date: 2026-07-14  
Scope: Requirements and Traceability lifecycle views

## Quality intent

- A lifecycle connector must remain visible and must not pass behind an unrelated card.
- Traceability must answer where one selected requirement reaches, rather than list every nearby model element.
- Inferred canonical links such as Requirement -> Acceptance Criterion and Test -> Evidence must participate in the same trace as explicit relations.

## Loss boundaries

- Any connector segment intersecting a non-endpoint lifecycle card is a failure.
- An unrelated or disconnected element appearing in Traceability is a failure.
- A valid Requirement -> Acceptance Criterion -> Test -> Evidence chain stopping early is a failure.
- Non-orthogonal lifecycle routing or a legacy rendering regression is a failure.

## Evidence

- Long requirement-to-architecture branches use a dedicated outer corridor instead of crossing the acceptance-card column.
- `test/lifecycle-views.test.ts` checks every generated requirement path segment against every non-endpoint card rectangle.
- Traceability computes terminal paths from the normalized relation set, including inferred acceptance and evidence relations.
- The Checkout release slice browser smoke produced 20 requirement cards and 16 paths with **0 card-intersection violations**.
- The same browser smoke rendered only these Traceability outcomes from `REQ-CHECKOUT-LOGIN`:
  - acceptance -> test -> evidence
  - Order API
  - Firebase Auth
  - Home
  - Login
- Unrelated architecture elements and unrelated lifecycle risks are absent.

## Verification

- `npm test -- --run test/lifecycle-views.test.ts`: 9/9 passed.
- `npm run typecheck`: passed.
- `npm test`: 21 files, 272 tests passed.
- `npm run build`: Core, extras, declarations, and `@archmap/lifecycle` passed.
- `git diff --check`: passed.

## QIF decision

Completion: **pass**.  
Success: **pass for the bounded lifecycle view slice**. Traceability is now outcome-oriented and component-safe for the covered fixtures. Larger multi-requirement filtering and collapse remain later scale work, not a blocker for this correction.
