/**
 * Validation View (§21 required, §31.10): highlights the nodes and edges that
 * carry validation errors/warnings so issues are visible on the diagram. The
 * full diagnostic text lives on the model (model.errors / model.warnings).
 */

import type { ViewContext } from "../render.js";
import { resolveNodeIcons } from "../icons.js";
import { renderDiagram } from "./base.js";
import { buildOverlayProjection } from "./overlays.js";

export function validationView(ctx: ViewContext): string {
  const { model, layout } = ctx;
  const projection = buildOverlayProjection(model, layout, ["validation"]);

  return renderDiagram({
    layout,
    viewClass: "validation",
    boxes: layout.zones,
    boxClass: "archmap-zone",
    // Only constrain channels that actually have flagged elements, so a clean
    // model isn't entirely faded.
    emphasizeNodes: projection.emphasizeNodes,
    emphasizeEdges: projection.emphasizeEdges,
    nodeBadges: projection.nodeBadges,
    nodeIcons: resolveNodeIcons(model),
  });
}
