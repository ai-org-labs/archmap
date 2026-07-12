# Topology View and Golden Grid

Status: Implemented v0.2 draft

## Intent

Topology is a containment-first base view for deployment, cloud, network, and
repeated regional diagrams. Overview remains flow-first; Layer remains
stack-first. Grid geometry is a renderer concern and does not change semantic
zone, boundary, or subgraph meaning.

## Visual semantics

- subgraph: transparent fill, dashed structural outline
- zone: low-opacity semantic fill and nesting
- boundary: logical/trust/network outline through the boundary overlay
- node: centered within one or more integer cells
- edge: component-safe orthogonal route through available gutters

## Golden-ratio invariant

Let `phi = (1 + sqrt(5)) / 2`.

```text
cellWidth = phi * cellHeight
gapX      = phi * gapY
paddingX  = phi * paddingY
root      = N columns * N rows
```

Therefore the complete grid width divided by its height is exactly `phi`.
Rectangular `rowSpan` and `columnSpan` merges do not change the root ratio.

## Automatic packing

1. Measure node size and required integer span.
2. Preserve graph flow rank as the preferred flow-axis cell.
3. Keep same-zone components close on the cross axis.
4. Increase the square grid until all rectangles fit.
5. Choose deterministic lowest-cost placements based on flow displacement,
   cross displacement, zone cohesion, and distance from the center.
6. Compute zone, boundary, and subgraph boxes from aligned occupied cells.
7. Route edges after placement; overlay changes reuse the cached layout.

## Optional hints

```yaml
layout:
  grid:
    aspect: golden
    size: auto
    align: center
    packing: balanced
    placements:
      - target: { type: node, id: Users }
        row: 1
        column: 3
        rowSpan: 1
        columnSpan: 2
```

Coordinates are 1-based positive integers. Hints are optional; normal
authoring does not require coordinates.

## Diagnostics

- `topology_grid_unknown_target`
- `topology_grid_invalid_placement`
- `topology_grid_placement_overlap`

## Acceptance

1. Complete canvas ratio and individual cell ratio equal `phi`.
2. Nodes do not overlap and remain inside their zone boxes.
3. Subgraphs render unfilled with dashed outlines.
4. Zone/subgraph/boundary overlay toggles do not change layout geometry.
5. Explicit cell spans are honored when valid.
6. Edge endpoints leave and enter component sides perpendicularly.
7. Output is deterministic for the same model and options.
