/**
 * Zone View (§24.2): nodes grouped into bands by zone (recommended order),
 * with cross-zone edges emphasized. Uses the zone-ranked layout.
 */

import type { ViewContext } from "../render.js";
import { resolveNodeIcons } from "../icons.js";
import { renderDiagram } from "./base.js";

export function zoneView(ctx: ViewContext): string {
  const { model, layout } = ctx;
  const zoneOf = new Map(model.nodes.map((n) => [n.id, n.zone]));

  const crossing = new Set<string>();
  for (const e of layout.edges) {
    const a = zoneOf.get(e.from);
    const b = zoneOf.get(e.to);
    if (a !== undefined && b !== undefined && a !== b) crossing.add(e.id);
  }

  return renderDiagram({
    layout,
    viewClass: "zone",
    boxes: layout.zones,
    boxClass: "archmap-zone",
    emphasizeEdges: crossing,
    nodeIcons: resolveNodeIcons(model),
  });
}
