# Topology Golden-grid QIF Check - 2026-07-12

## Quality intent

Provide a containment-first `Topology` view that composes cloud and system diagrams on a stable golden-ratio grid without replacing Overview or Layer. Subgraphs are structural guides, fixed to transparent fill and a dashed outline; zones retain a light fill.

## Risk and loss boundary

- Block release on component overlap, connector/component intersection, duplicate endpoints, non-perpendicular endpoint incidence, or nondeterministic placement.
- Block release when Add info toggles move components or change the canvas extent.
- Block release when the public SVG canvas loses the golden ratio.
- Treat unknown explicit placement targets and invalid/overlapping grid coordinates as authoring diagnostics.

## Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| UI/API base-view name | Pass | `Topology`, `baseView: "topology"`, built-in registry and tag radio |
| Whole canvas ratio | Pass | Browser `viewBox=0 0 1340 828`, ratio `1.61836`; automated rendered-SVG assertion |
| Cell/gap/padding ratio | Pass | Each horizontal/vertical pair equals phi in `computeTopologyLayout` tests |
| Cell merging | Pass | Integer `rowSpan` / `columnSpan`, automatic expansion for large components |
| Node overlap | Pass | Browser sample overlap count `0`; pairwise test coverage |
| Zone containment | Pass | Every zone member is inside its computed cell-aligned zone box |
| Subgraph presentation | Pass | Browser computed style: `fill:none`, `stroke-dasharray:7px, 5px` |
| Overlay stability | Pass | Empty and `subgraph,zone` overlays keep canvas and node coordinates identical |
| Connector safety | Pass | Render validation reports no component intersection, endpoint incidence, or exact endpoint overlap failures |
| Determinism | Pass | Repeated layout calls produce identical placements, nodes, and edges |
| Curated sample diagnostics | Pass | Golden-grid sample renders with no diagnostics |

## Verification

- `npm run typecheck`
- `npm test` - 244 tests passed before the two final QIF assertions; topology suite passed 9/9 after assertions
- `npm run build`
- In-app browser smoke at `http://127.0.0.1:5173/`

## Decision

Completion and success criteria are met for the initial Topology slice. Explicit placement hints are intentionally node anchors only in this release; zones and subgraphs derive their bounds from member component cells so containment cannot drift independently.
