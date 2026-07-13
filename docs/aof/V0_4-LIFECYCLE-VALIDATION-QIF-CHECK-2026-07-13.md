# v0.4 Lifecycle Validation QIF Check

Date: 2026-07-13
Task: TASK-103
Result: PASS

## Completion criteria

- PASS: registration-driven Core validation detects duplicate IDs, missing relation endpoints, unregistered relation types, required-field schema mismatches, self dependencies, and cycles for relation types registered as acyclic.
- PASS: the lifecycle plugin emits `requirement_without_acceptance`, `acceptance_without_test`, and `test_without_evidence` warnings.
- PASS: every new structural and traceability diagnostic targets the responsible extension element or relation ID.
- PASS: plugin element identity uses `elementType`, preserving domain fields such as `Requirement.type: functional` instead of overwriting them.

## Success criteria

- PASS: MVP AC-04, AC-05, AC-06, and AC-12 have focused assertions.
- PASS: lifecycle gap validation is installed through `@archmap/lifecycle`; Core does not embed lifecycle vocabulary.
- PASS: diagnostics remain non-blocking for rendering and the complete legacy regression suite remains green.

## Evidence

- `src/extensions.ts`
- `src/plugin.ts`
- `src/types.ts`
- `packages/lifecycle/src/validate.ts`
- `packages/lifecycle/src/vocabulary.ts`
- `test/plugin.test.ts`
- `test/lifecycle-plugin.test.ts`
- `npm run typecheck`
- focused plugin tests: 11 passed
- `npm test`: 19 files, 258 tests passed
- `npm run build`
- `npm run build:lifecycle`

## QIF intent and loss boundary

- Quality intent: structural defects and traceability gaps are actionable because diagnostics point to stable object IDs.
- Protected boundary: Core validates only registered generic schemas and relations; lifecycle-specific completeness policy stays in the lifecycle plugin.
- Loss avoided: Requirement domain type is retained, warnings do not block architecture rendering, and plugin absence does not create lifecycle diagnostics.

## Residual scope

- Deterministic query and trace traversal are TASK-104.
- Requirements, Traceability, and Quality views are TASK-105.
