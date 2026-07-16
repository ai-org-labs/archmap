/**
 * Overview View (§24.1): all nodes, all edges, and edge labels.
 * Resembles a normal architecture diagram.
 */

import type { ViewContext } from "../render.js";
import { resolveNodeIcons } from "../icons.js";
import type { ArchNode } from "../types.js";
import type { Box } from "./base.js";
import { renderDiagram } from "./base.js";
import { overviewZoneColorStyles } from "./zone-colors.js";

const SAFE_COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.%+\-, /]+\)|[a-z]+)$/i;

function safeLayerFill(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || !SAFE_COLOR.test(normalized)) return undefined;
  return normalized === "none" ? "transparent" : normalized;
}

function layerBackgroundStyles(ctx: ViewContext, boxes: Box[]): Map<string, string> | undefined {
  const background = ctx.model.view?.layer?.background;
  const mode = background?.mode ?? "default";
  if (mode === "default") return undefined;

  const solid = safeLayerFill(background?.color);
  const alternating = background?.colors?.map(safeLayerFill);
  const styles = new Map<string, string>();
  for (const [index, box] of boxes.entries()) {
    const fill = mode === "none"
      ? "transparent"
      : mode === "solid"
        ? solid
        : alternating?.[index % 2];
    if (fill) styles.set(box.id, `--archmap-layer-fill:${fill}`);
  }
  return styles.size > 0 ? styles : undefined;
}

const ANDROID_LAYER_LABELS: Record<string, string> = {
  applications: "Applications",
  application_framework: "Application Framework",
  libraries: "Libraries (user space)",
  linux_kernel: "Linux Kernel",
  baseband: "Baseband",
};

const STANDARD_LAYER_LABELS: Record<string, string> = {
  client: "Client",
  edge: "Edge",
  runtime: "Runtime",
  data: "Data",
  messaging: "Messaging",
  identity: "Identity",
  network: "Network",
  operations: "Operations",
  external: "External",
};

function androidStackLayer(node: Pick<ArchNode, "androidComponent" | "androidLayer" | "provider" | "layer">): string | undefined {
  if (node.androidComponent === "application" || node.androidComponent === "activity") return "applications";
  if (node.androidLayer === "framework_api" || node.androidLayer === "framework_service" || node.androidLayer === "system_service" || node.androidLayer === "ipc") {
    return "application_framework";
  }
  if (node.androidLayer === "hal" || node.androidLayer === "native_library" || node.androidLayer === "vendor_library") return "libraries";
  if (node.androidLayer === "kernel_driver" || node.provider === "linux") return "linux_kernel";
  if (node.androidLayer === "hardware" || node.androidLayer === "hardware_controller" || node.provider === "device") return "baseband";
  if (node.provider === "android" && node.layer === "client") return "applications";
  return undefined;
}

function layerKey(node: ArchNode): string {
  return androidStackLayer(node) ?? node.layer ?? "unknown";
}

export function layerBoxes(ctx: ViewContext): Box[] {
  const nodesById = new Map(ctx.model.nodes.map((node) => [node.id, node]));
  const groups = new Map<string, typeof ctx.layout.nodes>();
  for (const layoutNode of ctx.layout.nodes) {
    const node = nodesById.get(layoutNode.id);
    const key = node ? layerKey(node) : "unknown";
    groups.set(key, [...(groups.get(key) ?? []), layoutNode]);
  }
  const horizontalFlow = ctx.layout.direction === "LR";
  const lanes = [...groups.entries()]
    .map(([key, nodes]) => ({
      key,
      nodes,
      center: nodes.reduce((sum, node) => sum + (horizontalFlow ? node.y + node.h / 2 : node.x + node.w / 2), 0) / nodes.length,
    }))
    .sort((a, b) => a.center - b.center || a.key.localeCompare(b.key));

  return lanes.map((lane, depth) => {
    const crossExtent = horizontalFlow ? ctx.layout.height : ctx.layout.width;
    const before = crossExtent * depth / lanes.length;
    const after = crossExtent * (depth + 1) / lanes.length;
    return {
      id: lane.key,
      label: ANDROID_LAYER_LABELS[lane.key] ?? STANDARD_LAYER_LABELS[lane.key] ?? lane.key,
      depth,
      x: horizontalFlow ? 0 : before,
      y: horizontalFlow ? before : 0,
      w: horizontalFlow ? ctx.layout.width : after - before,
      h: horizontalFlow ? after - before : ctx.layout.height,
    };
  });
}

export function overviewView(ctx: ViewContext): string {
  const zoneStyles = overviewZoneColorStyles(ctx.model, ctx.layout);
  return renderDiagram({
    layout: ctx.layout,
    viewClass: "overview",
    nodeIcons: resolveNodeIcons(ctx.model),
    ...zoneStyles,
  });
}

export function layerView(ctx: ViewContext): string {
  const boxes = layerBoxes(ctx);
  return renderDiagram({
    layout: ctx.layout,
    viewClass: "layer",
    boxGroups: [{ boxes, boxClass: "archmap-layer" }],
    boxStyles: layerBackgroundStyles(ctx, boxes),
    nodeIcons: resolveNodeIcons(ctx.model),
    preserveBoxGeometry: true,
  });
}
