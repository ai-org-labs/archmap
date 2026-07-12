# Topology Zone Clearance QIF Check - 2026-07-13

## Quality intent

Make sibling zone boundaries immediately distinguishable in Topology by preserving a visible gap between their translucent regions.

## Loss boundary

- Block completion when sibling zone rectangles overlap or touch without readable space.
- Preserve intentional parent-child zone containment.
- Do not reduce member padding enough for nodes to cross a zone boundary.

## Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Minimum sibling clearance | Pass | Automated geometry assertion requires at least 24 layout units |
| Zone overlap | Pass | Pairwise test and browser overlap count are both zero |
| Member containment | Pass | Existing member-inside-zone assertions remain green |
| Browser rendering | Pass | `golden-topology` has no pair below the configured threshold |
| Regression suite | Pass | 17 test files, 246 tests passed |

## Verification

- `npm run typecheck`
- `npm test` - 246 tests passed
- `npm run build`
- In-app browser smoke at `http://127.0.0.1:5173/`

## Decision

Sibling Topology zones must retain a minimum 24-unit clearance. Nested parent-child zones remain intentionally overlapping because they express containment rather than competing regions.
