/**
 * Overview View (§24.1): all nodes, all edges, and edge labels.
 * Resembles a normal architecture diagram.
 */

import type { ViewContext } from "../render.js";
import { resolveNodeIcons } from "../icons.js";
import type { ArchNode } from "../types.js";
import type { Box } from "./base.js";
import { renderDiagram } from "./base.js";

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
  return [...groups.entries()].map(([key, nodes], depth) => {
    const minY = Math.min(...nodes.map((node) => node.y));
    const maxY = Math.max(...nodes.map((node) => node.y + node.h));
    return {
      id: key,
      label: ANDROID_LAYER_LABELS[key] ?? STANDARD_LAYER_LABELS[key] ?? key,
      depth,
      x: 20,
      y: minY - 34,
      w: Math.max(80, ctx.layout.width - 40),
      h: maxY - minY + 68,
    };
  });
}

export function overviewView(ctx: ViewContext): string {
  return renderDiagram({
    layout: ctx.layout,
    viewClass: "overview",
    nodeIcons: resolveNodeIcons(ctx.model),
  });
}

export function layerView(ctx: ViewContext): string {
  return renderDiagram({
    layout: ctx.layout,
    viewClass: "layer",
    boxGroups: [{ boxes: layerBoxes(ctx), boxClass: "archmap-layer" }],
    nodeIcons: resolveNodeIcons(ctx.model),
  });
}
