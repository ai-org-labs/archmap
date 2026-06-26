/**
 * Boundary View (§24.6): draws trust/network/cloud boundaries and emphasizes
 * edges that cross a boundary or a zone, plus the nodes at those crossings
 * (internet-facing entry points).
 */

import type { ViewContext } from "../render.js";
import type { BoundaryCrossing } from "../types.js";
import { resolveNodeIcons } from "../icons.js";
import { renderDiagram } from "./base.js";

function crosses(value: BoundaryCrossing | undefined): boolean {
  return value !== undefined && !value.assertedFalse;
}

export function boundaryView(ctx: ViewContext): string {
  const { model, layout } = ctx;
  const zoneOf = new Map(model.nodes.map((n) => [n.id, n.resolvedZone === "unknown" ? undefined : n.resolvedZone ?? n.zone]));
  const edgeById = new Map(model.edges.map((e) => [e.id, e]));

  const edges = new Set<string>();
  const nodes = new Set<string>();
  for (const e of layout.edges) {
    const model_e = edgeById.get(e.id);
    const za = zoneOf.get(e.from);
    const zb = zoneOf.get(e.to);
    const zoneCross = za !== undefined && zb !== undefined && za !== zb;
    if (crosses(model_e?.boundaryCrossing) || zoneCross) {
      edges.add(e.id);
      nodes.add(e.from);
      nodes.add(e.to);
    }
  }

  return renderDiagram({
    layout,
    viewClass: "boundary",
    boxes: layout.boundaries,
    boxClass: "archmap-boundary",
    emphasizeNodes: nodes,
    emphasizeEdges: edges,
    nodeIcons: resolveNodeIcons(model),
  });
}
