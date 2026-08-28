# FQA Readability Review - 2026-08-29

## Scope

- Baseline: ArchMap v0.4.0 development branch
- Review method: First Question Agent v0.1.0 first-question probe
- Reproduction: load `Checkout release slice`, select `Requirements`, and fit the diagram
- Goal: remove controls and repeated detail that do not help the current reading task while preserving the canonical model

## First question

FQA asked for a logical trace of the user journey from loading the sample through selecting Requirements and fitting the view, including the current surface, source and destination surfaces, and trajectory sets.

The evidence gap was `logical_state_missing`: the rendered projection did not make its reading context explicit enough. The toolbar also presented render-mode and additive-overlay controls that do not affect lifecycle projections.

## Findings

1. Requirements rendered the same architecture component once per requirement branch, producing 20 cards and 16 relations for four requirements.
2. The initial diagram used a `1088 x 2066` view box, so useful text became small when fitted.
3. Repeated architecture cards and parallel relation labels dominated the primary requirement-to-acceptance reading path.
4. Lifecycle views displayed 2D/3D and Add info controls even though those controls do not alter these projections.
5. The canonical model itself was valid; the issue was projection density and missing view context, not source data loss.

## Decisions

- Keep canonical lifecycle elements and relations unchanged.
- Summarize implementation targets once per requirement branch inside the Requirements projection.
- Read each branch as `Requirement -> Acceptance criterion -> Implementation`.
- Use `fulfilled by` for the summary edge so mixed `realized_by` and `implemented_by` targets are not misrepresented.
- Mark lifecycle toolbar contributions as `view-only`; the host toolbar hides render-mode and additive-overlay groups for those views.
- Restore all controls immediately when returning to Overview, Topology, Layer, Prototype, or Runtime.

## Verification evidence

| Check | Before | After |
| --- | ---: | ---: |
| Requirements cards | 20 | 12 |
| Requirements relations | 16 | 8 |
| Requirements view-box height | 2066 | 1034 |
| Irrelevant control groups in lifecycle views | visible | hidden |
| Controls after returning to Overview | visible | visible |

Targeted browser checks confirmed that Requirements, Traceability, and Quality hide irrelevant controls, while Overview restores them. The Requirements projection contains four independent branches with no duplicated architecture cards.

## Remaining questions

- Traceability still defaults to the first requirement without an explicit root selector in the demo.
- Quality intentionally shows all four verification chains; a root or status filter would improve larger models.
- A later task should expose projection root and filter state as first-class UI state rather than inferring it from the rendered diagram.
