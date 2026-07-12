# Topology Zone Separation QIF Check - 2026-07-12

## Quality intent

Keep Topology containment readable by rendering zones as translucent colored regions while preventing sibling zones from occupying the same canvas area.

## Loss boundary

- Block completion when any sibling Topology zone rectangles intersect.
- Block completion when zone fill is opaque or makes contained components hard to read.
- Block completion when enabling overlays reintroduces a visual outset that causes overlap.
- Preserve opaque node and connector colors for contrast.

## Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Zone translucency | Pass | Palette fills render as `rgba(..., 0.3)` |
| Sibling zone separation | Pass | Pairwise layout assertion and browser overlap count `0` |
| Overlay geometry | Pass | Topology render path preserves computed box geometry with overlays enabled |
| Grid fallback | Pass | Overlapping placement candidates are rejected so packing can grow the grid |
| Regression suite | Pass | 17 test files, 246 tests passed |

## Verification

- `npm run typecheck`
- `npm test` - 246 tests passed
- `npm run build`
- In-app browser smoke with `golden-topology` at `http://127.0.0.1:5173/`

## Decision

Topology zones use a 30 percent alpha fill and sibling zone overlap is invalid. Overview retains its existing visual outset; Topology uses its exact grid-derived area geometry.
