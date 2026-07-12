/** Topology View: containment-first composition on a golden-ratio grid. */
import type { ViewContext } from "../render.js";
import { resolveNodeIcons } from "../icons.js";
import { renderDiagram } from "./base.js";
import { overviewZoneColorStyles } from "./zone-colors.js";

export function topologyView(ctx: ViewContext): string {
  return renderDiagram({
    layout: ctx.layout,
    viewClass: "topology",
    preserveLayoutExtent: true,
    nodeIcons: resolveNodeIcons(ctx.model),
    ...overviewZoneColorStyles(ctx.model, ctx.layout),
  });
}
