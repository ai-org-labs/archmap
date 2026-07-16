# Multi-line Connector Label QIF Check — 2026-07-17

## Quality intent

Ordinary connector labels may contain intentional line breaks while retaining
an accurately sized background and collision reservation around the routed
edge.

## QIF decision

| Check | Result | Evidence |
| --- | --- | --- |
| Graph escape parsing | PASS | `\\n` is normalized inside graph connector labels |
| YAML label parsing | PASS | block scalar newlines remain in the canonical edge label |
| Width calculation | PASS | the longest visual line determines label width |
| Height calculation | PASS | line count determines the full background height |
| SVG output | PASS | each visual line is emitted as a centered `tspan` |
| Collision geometry | PASS | layout reserves the same centered multiline bounds used by SVG |
| Targeted regressions | PASS | parser, render, edge, and layout suites: 147 tests |
| Static contracts | PASS | typecheck and production build |

## Loss boundaries

- **Supported:** `\\n` inside graph connector labels and real newlines in YAML metadata labels.
- **Preserved:** single-line labels, edge routing, post-offset label placement, and compact semantic overlay badges.
- **Scoped out:** automatic prose wrapping and multiline auth/dataflow/permission summary badges.

## Outcome

TASK-112 meets the multi-line ordinary connector-label contract without fixed
pixel dimensions in authored DSL or changes to stable edge identity.
