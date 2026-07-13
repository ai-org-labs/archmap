# v0.4 Lifecycle Baseline QIF Check - 2026-07-13

## Quality intent

Turn the approved lifecycle vision into an implementable, plugin-first v0.4
contract without expanding `@archmap/core` into a mandatory requirements,
quality, security, or connector suite.

## Loss boundaries

- Block implementation that breaks unmodified v0.3 parsing/rendering.
- Block direct Requirement/Risk/Test/Evidence vocabulary dependencies in Core.
- Block hidden global plugin state that leaks between ArchMap instances.
- Block unresolved or nondeterministic lifecycle relations and traces.
- Block AI-created trusted Evidence or human Approval.
- Block views that copy lifecycle data into view-owned stores.
- Block v0.4 release without AC-01..AC-12 evidence and 100/1,000/10,000-element
  performance measurements.

## Decisions checked

| Decision | Result |
| --- | --- |
| Additive compatibility | Pass: v0.3 architecture collections remain authoritative and unchanged |
| Core/plugin boundary | Pass: Core owns registries/generic graph; lifecycle owns domain schema/validation/views |
| First package | Pass: `@archmap/lifecycle` is the first extracted plugin |
| Initial repository layout | Pass: root remains Core; `packages/lifecycle` avoids disruptive Core relocation |
| MVP vertical slice | Pass: Requirement -> Criterion -> Architecture -> Test -> Evidence |
| Validator ownership | Pass: structural rules in Core, lifecycle gaps in lifecycle, advanced evidence/readiness in quality |
| Installation semantics | Pass: lifecycle installs Schema + Relations + Validation + Views together |
| Periodic governance | Pass: TASK-107 requires QIF after every stage and before release |

## Verification

- AOF JSON parsed successfully.
- `git diff --check` passed.
- `aof organization-verify --project .` passed 46/46.
- README links the planned v0.4 specification and marks it unimplemented.

## Decision

Begin TASK-100 with isolated Core plugin registries. Do not add lifecycle domain
types to Core and do not move the current Core package into a monorepo subfolder
during the vertical slice.
