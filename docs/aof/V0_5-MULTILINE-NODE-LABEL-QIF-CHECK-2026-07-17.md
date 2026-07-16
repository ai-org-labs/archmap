# Multi-line Node Label QIF Check — 2026-07-17

## Quality intent

Component labels may contain intentional line breaks without escaping their
shape, colliding with an icon, or changing the stable component ID.

## QIF decision

| Check | Result | Evidence |
| --- | --- | --- |
| Graph escape parsing | PASS | `\\n` is normalized for rectangle, database, circle, and diamond labels |
| YAML label parsing | PASS | block scalar newlines remain in the canonical node label |
| Width calculation | PASS | the longest visual line determines node width |
| Height calculation | PASS | line count increases node height above the single-line minimum |
| SVG output | PASS | each visual line is emitted as a centered `tspan` |
| Icon alignment | PASS | icon and multi-line text use one vertically centered label row |
| Targeted regressions | PASS | parser and render suites: 101 tests |
| Static contracts | PASS | typecheck and production build |

## Loss boundaries

- **Blocked:** literal multi-line graph declarations that make one node token span source lines.
- **Supported:** `\\n` inside graph labels and real newlines in YAML metadata labels.
- **Preserved:** stable node IDs, all four node shapes, icon resolution, and existing single-line labels.
- **Scoped out:** automatic prose wrapping; line breaks remain an author decision.

## Outcome

TASK-111 meets the multi-line component-label contract without changing the
existing graph grammar or requiring fixed pixel dimensions in authored DSL.
