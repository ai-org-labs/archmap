/**
 * Auth View (§24.3): emphasizes identity providers, auth services, users,
 * token issue/validate edges, token-carrying edges, and the nodes that issue
 * or validate tokens. Everything else is faded.
 */

import type { ViewContext } from "../render.js";
import { resolveNodeIcons } from "../icons.js";
import { renderDiagram } from "./base.js";
import { buildOverlayProjection } from "./overlays.js";

export function authView(ctx: ViewContext): string {
  const { model, layout } = ctx;
  const projection = buildOverlayProjection(model, layout, ["auth"]);

  return renderDiagram({
    layout,
    viewClass: "auth",
    boxes: layout.zones,
    boxClass: "archmap-zone",
    emphasizeNodes: projection.emphasizeNodes,
    emphasizeEdges: projection.emphasizeEdges,
    nodeBadges: projection.nodeBadges,
    edgeBadges: projection.edgeBadges,
    nodeIcons: resolveNodeIcons(model),
  });
}
