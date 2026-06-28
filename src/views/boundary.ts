/**
 * Boundary View (§24.6): draws trust/network/cloud boundaries and emphasizes
 * edges that cross a boundary or a zone, plus the nodes at those crossings
 * (internet-facing entry points).
 */

import type { ViewContext } from "../render.js";
import { resolveNodeIcons } from "../icons.js";
import { renderDiagram } from "./base.js";
import { buildOverlayProjection } from "./overlays.js";

export function boundaryView(ctx: ViewContext): string {
  const { model, layout } = ctx;
  const projection = buildOverlayProjection(model, layout, ["boundary"]);

  return renderDiagram({
    layout,
    viewClass: "boundary",
    boxes: layout.boundaries,
    boxClass: "archmap-boundary",
    emphasizeNodes: projection.emphasizeNodes,
    emphasizeEdges: projection.emphasizeEdges,
    nodeIcons: resolveNodeIcons(model),
  });
}
