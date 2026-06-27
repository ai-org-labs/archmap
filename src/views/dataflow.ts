/**
 * Data Flow View (§24.5): emphasizes data objects' storage/processing nodes,
 * storage-kind nodes, and edges that carry data; fades the rest. Data
 * classifications are shown as node badges when declared.
 */

import type { ViewContext } from "../render.js";
import { resolveNodeIcons } from "../icons.js";
import { renderDiagram } from "./base.js";
import { buildOverlayProjection } from "./overlays.js";

export function dataflowView(ctx: ViewContext): string {
  const { model, layout } = ctx;
  const projection = buildOverlayProjection(model, layout, ["dataflow"]);

  return renderDiagram({
    layout,
    viewClass: "dataflow",
    boxes: layout.zones,
    boxClass: "archmap-zone",
    emphasizeNodes: projection.emphasizeNodes,
    emphasizeEdges: projection.emphasizeEdges,
    nodeBadges: projection.nodeBadges,
    edgeBadges: projection.edgeBadges,
    nodeIcons: resolveNodeIcons(model),
  });
}
