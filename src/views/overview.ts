/**
 * Overview View (§24.1): all nodes, all edges, edge labels, and zone boxes.
 * Resembles a normal architecture diagram.
 */

import type { ViewContext } from "../render.js";
import { resolveNodeIcons } from "../icons.js";
import { renderDiagram } from "./base.js";

export function overviewView(ctx: ViewContext): string {
  return renderDiagram({
    layout: ctx.layout,
    viewClass: "overview",
    boxes: ctx.layout.zones,
    boxClass: "archmap-zone",
    nodeIcons: resolveNodeIcons(ctx.model),
  });
}
