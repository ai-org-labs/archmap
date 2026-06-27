/**
 * Overview View (§24.1): all nodes, all edges, edge labels, and zone boxes.
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

function humanizeId(id: string): string {
  return id.replace(/[_-]+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
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

export function subgraphBoxes(ctx: ViewContext): Box[] {
  const nodesById = new Map(ctx.layout.nodes.map((node) => [node.id, node]));
  return Object.values(ctx.model.graph.subgraphs)
    .map((subgraph, depth): Box | undefined => {
      const members = subgraph.members
        .map((id) => nodesById.get(id))
        .filter((node): node is NonNullable<ReturnType<typeof nodesById.get>> => !!node);
      if (members.length === 0) return undefined;
      const minX = Math.min(...members.map((node) => node.x));
      const minY = Math.min(...members.map((node) => node.y));
      const maxX = Math.max(...members.map((node) => node.x + node.w));
      const maxY = Math.max(...members.map((node) => node.y + node.h));
      return {
        id: subgraph.id,
        label: subgraph.label ?? humanizeId(subgraph.id),
        depth,
        x: minX - 18,
        y: minY - 28,
        w: maxX - minX + 36,
        h: maxY - minY + 52,
      };
    })
    .filter((box): box is Box => !!box);
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
    boxGroups: [
      { boxes: layerBoxes(ctx), boxClass: "archmap-layer" },
      { boxes: subgraphBoxes(ctx), boxClass: "archmap-subgraph" },
    ],
    nodeIcons: resolveNodeIcons(ctx.model),
  });
}
