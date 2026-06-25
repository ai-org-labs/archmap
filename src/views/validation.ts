/**
 * Validation View (§21 required, §31.10): highlights the nodes and edges that
 * carry validation errors/warnings so issues are visible on the diagram. The
 * full diagnostic text lives on the model (model.errors / model.warnings).
 */

import type { ViewContext } from "../render.js";
import { resolveNodeIcons } from "../icons.js";
import { renderDiagram } from "./base.js";

export function validationView(ctx: ViewContext): string {
  const { model, layout } = ctx;
  const nodes = new Set<string>();
  const edges = new Set<string>();
  const badges = new Map<string, string>();

  for (const d of [...model.errors, ...model.warnings]) {
    if (!d.ref) continue;
    if (d.ref.kind === "node") {
      nodes.add(d.ref.id);
      badges.set(d.ref.id, d.severity === "error" ? "✖" : "▲");
    } else if (d.ref.kind === "edge") {
      edges.add(d.ref.id);
    }
  }

  return renderDiagram({
    layout,
    viewClass: "validation",
    boxes: layout.zones,
    boxClass: "archmap-zone",
    // Only constrain channels that actually have flagged elements, so a clean
    // model isn't entirely faded.
    emphasizeNodes: nodes.size ? nodes : undefined,
    emphasizeEdges: edges.size ? edges : undefined,
    nodeBadges: badges,
    nodeIcons: resolveNodeIcons(model),
  });
}
