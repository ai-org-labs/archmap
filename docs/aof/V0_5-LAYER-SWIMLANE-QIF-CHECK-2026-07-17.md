# Layer Swimlane QIF Check — 2026-07-17

## Quality intent

Layer view must support business workflows as conventional swimlanes. Lane
backgrounds share borders without gutters, orientation follows the authored
graph direction, and the layout remains independent from zone and boundary
semantics.

## QIF decision

| Check | Result | Evidence |
| --- | --- | --- |
| LR orientation | PASS | horizontal lanes with left-to-right flow |
| TD/TB orientation | PASS | vertical lanes with top-to-bottom flow |
| Contiguous lane boundaries | PASS | adjacent band coordinates meet exactly |
| Full canvas partition | PASS | every lane spans the complete flow axis |
| Swimlane visual treatment | PASS | square lane corners and preserved band geometry |
| Existing Layer compatibility | PASS | Android fixed-layer regression remains green |
| Targeted regression coverage | PASS | 59 render tests |
| Static contracts | PASS | typecheck and production build |

## Loss boundaries

- **Blocked:** visual gutters between adjacent Layer bands.
- **Blocked:** using zone or boundary geometry as the Layer partition.
- **Blocked:** changing orientation without an explicit graph direction change.
- **Preserved:** internal content spacing around nodes within each lane.

## Outcome

TASK-110 meets the Layer-view swimlane contract. Authors can use `graph LR`
for horizontal business-flow lanes or `graph TD`/`graph TB` for vertical-column
lanes without introducing new DSL fields.
