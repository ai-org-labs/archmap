/**
 * Shared SVG assembly for 2D views.
 *
 * Every view produces the same diagram skeleton (zone/boundary boxes, edges,
 * nodes) and differs only in: which container boxes to draw, which elements to
 * emphasize vs. fade, and optional per-node badges. Keeping this in one place
 * means a new view is a small classifier, not a new renderer.
 */

import type { LayoutNode, LayoutResult } from "../layout.js";
import type { ResolvedIcon } from "../icons.js";
import { iconDomId } from "../icons.js";
import {
  DEFAULT_STYLE,
  MARKERS,
  buildEdgePaths,
  edgeLabelSvg,
  edgeStartpointSvg,
  edgePathFromD,
  escapeXml,
  nodeBadgeSvg,
  nodeSvg,
} from "./svg.js";

export interface Box {
  id: string;
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiagramSpec {
  layout: LayoutResult;
  /** Suffix for the root class, e.g. "overview" -> archmap-view-overview. */
  viewClass: string;
  boxes?: Box[];
  /** Group/box class, e.g. "archmap-zone" or "archmap-boundary". */
  boxClass?: string;
  boxGroups?: Array<{ boxes: Box[]; boxClass: string }>;
  /**
   * When provided, nodes/edges in the set are emphasized and the rest faded.
   * Omit a channel to leave those elements at normal weight.
   */
  emphasizeNodes?: Set<string>;
  emphasizeEdges?: Set<string>;
  /** Node id -> short caption rendered beneath the node. */
  nodeBadges?: Map<string, string>;
  /** Overlay-only edges, such as synthesized permission relationships. */
  overlayEdges?: Array<{ id: string; from: string; to: string; label?: string; className?: string }>;
  /** Node id -> resolved provider/kind icon (from the icon registry). */
  nodeIcons?: Map<string, ResolvedIcon>;
}

function channelClass(id: string, set: Set<string> | undefined): string {
  if (!set) return "";
  return set.has(id) ? " archmap-emphasis" : " archmap-faded";
}

type OverlayEdge = NonNullable<DiagramSpec["overlayEdges"]>[number];
type Face = "left" | "right" | "top" | "bottom";

interface Port {
  edgeIndex: number;
  face: Face;
  sort: number;
  x: number;
  y: number;
}

interface OverlayDrawable {
  id: string;
  index: number;
  entry: {
    edge: OverlayEdge;
    from: LayoutNode;
    to: LayoutNode;
    source: Port;
    target: Port;
  };
  points: Array<{ x: number; y: number }>;
}

interface OverlayPlan {
  drawables: OverlayDrawable[];
  permissionLabelsByTarget: Map<string, string[]>;
  targetSlot: Map<string, { slot: number; count: number }>;
}

function center(n: LayoutNode): { x: number; y: number } {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

function chooseFaces(from: LayoutNode, to: LayoutNode): { source: Face; target: Face } {
  const a = center(from);
  const b = center(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { source: "right", target: "left" } : { source: "left", target: "right" };
  }
  return dy >= 0 ? { source: "bottom", target: "top" } : { source: "top", target: "bottom" };
}

function boundaryPoint(node: LayoutNode, face: Face, point: { x: number; y: number }): { x: number; y: number } {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const rx = node.w / 2;
  const ry = node.h / 2;
  const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
  const safeSqrt = (value: number): number => Math.sqrt(Math.max(0, value));

  if (node.shape === "circle") {
    if (face === "left" || face === "right") {
      const y = clamp(point.y, node.y, node.y + node.h);
      const dx = rx * safeSqrt(1 - ((y - cy) / ry) ** 2);
      return { x: cx + (face === "right" ? dx : -dx), y };
    }
    const x = clamp(point.x, node.x, node.x + node.w);
    const dy = ry * safeSqrt(1 - ((x - cx) / rx) ** 2);
    return { x, y: cy + (face === "bottom" ? dy : -dy) };
  }

  if (node.shape === "diamond") {
    if (face === "left" || face === "right") {
      const y = clamp(point.y, node.y, node.y + node.h);
      const dx = rx * Math.max(0, 1 - Math.abs(y - cy) / ry);
      return { x: cx + (face === "right" ? dx : -dx), y };
    }
    const x = clamp(point.x, node.x, node.x + node.w);
    const dy = ry * Math.max(0, 1 - Math.abs(x - cx) / rx);
    return { x, y: cy + (face === "bottom" ? dy : -dy) };
  }

  if (node.shape === "database") {
    const capRy = Math.min(10, node.h / 6);
    const topCy = node.y + capRy;
    const bottomCy = node.y + node.h - capRy;
    if (face === "left" || face === "right") {
      const y = clamp(point.y, node.y, node.y + node.h);
      let x = face === "right" ? node.x + node.w : node.x;
      if (y < topCy) {
        const dx = rx * safeSqrt(1 - ((y - topCy) / capRy) ** 2);
        x = cx + (face === "right" ? dx : -dx);
      } else if (y > bottomCy) {
        const dx = rx * safeSqrt(1 - ((y - bottomCy) / capRy) ** 2);
        x = cx + (face === "right" ? dx : -dx);
      }
      return { x, y };
    }
    const x = clamp(point.x, node.x, node.x + node.w);
    const capCy = face === "bottom" ? bottomCy : topCy;
    const dy = capRy * safeSqrt(1 - ((x - cx) / rx) ** 2);
    return { x, y: capCy + (face === "bottom" ? dy : -dy) };
  }

  if (face === "left") return { x: node.x, y: clamp(point.y, node.y, node.y + node.h) };
  if (face === "right") return { x: node.x + node.w, y: clamp(point.y, node.y, node.y + node.h) };
  if (face === "top") return { x: clamp(point.x, node.x, node.x + node.w), y: node.y };
  return { x: clamp(point.x, node.x, node.x + node.w), y: node.y + node.h };
}

function portPoint(node: LayoutNode, face: Face, slot: number, count: number): { x: number; y: number } {
  const inset = Math.min(10, Math.max(4, Math.min(node.w, node.h) * 0.12));
  const span = face === "left" || face === "right" ? Math.max(1, node.h - inset * 2) : Math.max(1, node.w - inset * 2);
  const along = count <= 1 ? 0.5 : slot / (count - 1);
  if (face === "left") return boundaryPoint(node, face, { x: node.x, y: node.y + inset + span * along });
  if (face === "right") return boundaryPoint(node, face, { x: node.x + node.w, y: node.y + inset + span * along });
  if (face === "top") return boundaryPoint(node, face, { x: node.x + inset + span * along, y: node.y });
  return boundaryPoint(node, face, { x: node.x + inset + span * along, y: node.y + node.h });
}

function orthogonalPoints(a: { x: number; y: number }, b: { x: number; y: number }, sourceFace: Face, targetFace: Face): Array<{ x: number; y: number }> {
  const sourceHorizontal = sourceFace === "left" || sourceFace === "right";
  const targetHorizontal = targetFace === "left" || targetFace === "right";
  if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) return [a, b];
  if (sourceHorizontal !== targetHorizontal) {
    return sourceHorizontal ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b];
  }
  if (sourceHorizontal) {
    const midX = (a.x + b.x) / 2;
    return [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
  }
  const midY = (a.y + b.y) / 2;
  return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
}

function labelAnchor(node: LayoutNode, face: Face, slot: number, count: number, label: string): { x: number; y: number; orient: "h" | "v" } {
  const p = portPoint(node, face, slot, count);
  const labelWidth = label.length * 6.5 + 8;
  const offset = 12;
  if (face === "left") return { x: node.x - labelWidth / 2 - offset, y: p.y, orient: "h" };
  if (face === "right") return { x: node.x + node.w + labelWidth / 2 + offset, y: p.y, orient: "h" };
  if (face === "top") return { x: p.x, y: node.y - offset, orient: "h" };
  return { x: p.x, y: node.y + node.h + offset, orient: "h" };
}

function permissionSummarySvg(node: LayoutNode, labels: string[]): string {
  const unique = [...new Set(labels)];
  const text = unique.length === 1 ? "1 permission" : `${unique.length} permissions`;
  const w = Math.min(node.w - 14, Math.max(76, text.length * 6.2 + 14));
  const h = 18;
  const x = node.x + node.w - w - 7;
  const y = node.y + node.h - h - 6;
  return (
    `<g class="archmap-overlay-summary archmap-permission-summary">` +
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="4" />` +
    `<text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>` +
    `</g>`
  );
}

function textBox(text: string, x: number, y: number): Box {
  return { id: "", x: x - 2, y: y - 12, w: text.length * 6.8 + 8, h: 17 };
}

function overlaps(a: Box, b: Box): boolean {
  return Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
}

function planOverlayEdges(edges: OverlayEdge[] | undefined, nodeById: Map<string, LayoutNode>): OverlayPlan {
  if (!edges?.length) return { drawables: [], permissionLabelsByTarget: new Map(), targetSlot: new Map() };
  const permissionEdges = edges.filter((edge) => edge.className?.includes("archmap-permission-edge"));
  const densePermissionOverlay = permissionEdges.length > 8;
  const permissionLabelsByTarget = new Map<string, string[]>();
  if (densePermissionOverlay) {
    for (const edge of permissionEdges) {
      if (!edge.label) continue;
      permissionLabelsByTarget.set(edge.to, [...(permissionLabelsByTarget.get(edge.to) ?? []), edge.label]);
    }
  }
  const sourcePorts = new Map<string, Port[]>();
  const targetPorts = new Map<string, Port[]>();
  const resolved = edges.map((edge, index) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) return undefined;
    const faces = chooseFaces(from, to);
    const fromCenter = center(from);
    const toCenter = center(to);
    const source: Port = { edgeIndex: index, face: faces.source, sort: toCenter.y * 100000 + toCenter.x, x: 0, y: 0 };
    const target: Port = { edgeIndex: index, face: faces.target, sort: fromCenter.y * 100000 + fromCenter.x, x: 0, y: 0 };
    const sourceKey = `${edge.from}|${faces.source}`;
    const targetKey = `${edge.to}|${faces.target}`;
    (sourcePorts.get(sourceKey) ?? (sourcePorts.set(sourceKey, []), sourcePorts.get(sourceKey)!)).push(source);
    (targetPorts.get(targetKey) ?? (targetPorts.set(targetKey, []), targetPorts.get(targetKey)!)).push(target);
    return { edge, from, to, source, target };
  });

  const assign = (ports: Map<string, Port[]>): void => {
    for (const [key, entries] of ports) {
      const node = nodeById.get(key.slice(0, key.lastIndexOf("|")))!;
      const face = key.slice(key.lastIndexOf("|") + 1) as Face;
      entries.sort((a, b) => a.sort - b.sort || a.edgeIndex - b.edgeIndex);
      entries.forEach((entry, slot) => {
        const p = portPoint(node, face, slot, entries.length);
        entry.x = p.x;
        entry.y = p.y;
      });
    }
  };
  assign(sourcePorts);
  assign(targetPorts);

  const targetSlot = new Map<string, { slot: number; count: number }>();
  for (const [key, entries] of targetPorts) {
    entries.forEach((entry, slot) => targetSlot.set(`${entry.edgeIndex}|${key}`, { slot, count: entries.length }));
  }

  const drawables = resolved
    .map((entry, index) => entry
      ? { id: entry.edge.id, index, entry, points: orthogonalPoints(entry.source, entry.target, entry.source.face, entry.target.face) }
      : undefined)
    .filter((item): item is OverlayDrawable => !!item);

  return { drawables, permissionLabelsByTarget, targetSlot };
}

function renderOverlayEdges(plan: OverlayPlan, edgePaths: Map<string, string>, densePermissionOverlay: boolean): string {
  return plan.drawables
    .map((item) => {
      const { entry, index } = item;
      const d = edgePaths.get(entry.edge.id) ?? "";
      const cls = entry.edge.className ?? "archmap-overlay-edge";
      const key = `${index}|${entry.edge.to}|${entry.target.face}`;
      const stack = plan.targetSlot.get(key) ?? { slot: 0, count: 1 };
      const suppressLabel = densePermissionOverlay && entry.edge.className?.includes("archmap-permission-edge");
      const label = entry.edge.label && !suppressLabel
        ? edgeLabelSvg(entry.edge.label, labelAnchor(entry.to, entry.target.face, stack.slot, stack.count, entry.edge.label), "h")
        : "";
      return `<g class="${cls}" data-id="${escapeXml(entry.edge.id)}">${edgePathFromD(d, "archmap-arrow-emph")}${edgeStartpointSvg(entry.source)}${label}</g>`;
    })
    .join("") +
    [...plan.permissionLabelsByTarget.entries()]
      .map(([target, labels]) => {
        const node = plan.drawables.find((item) => item.entry.to.id === target)?.entry.to;
        return node ? permissionSummarySvg(node, labels) : "";
      })
      .join("");
}

export function renderDiagram(spec: DiagramSpec): string {
  const { layout, viewClass, boxes, boxClass = "archmap-zone", emphasizeNodes, emphasizeEdges, nodeBadges, overlayEdges, nodeIcons } = spec;
  const boxGroups = spec.boxGroups ?? (boxes ? [{ boxes, boxClass }] : []);
  const reservedBoxLabels: Box[] = [];

  const boxesSvg = boxGroups
    .map((group) => {
      const boxLabelClass = group.boxClass === "archmap-boundary" ? "archmap-boundary-label" : "archmap-zone-label";
      const boxBoxClass = group.boxClass === "archmap-boundary" ? "archmap-boundary-box" : "archmap-zone-box";
      return group.boxes
        .map((b) => {
          const label = b.label ?? b.id;
          const x = b.x + 10;
          let y = b.y + 18;
          const maxY = b.y + Math.min(Math.max(20, b.h - 8), 68);
          while (y <= maxY && reservedBoxLabels.some((other) => overlaps(textBox(label, x, y), other))) y += 16;
          reservedBoxLabels.push(textBox(label, x, y));
          return (
            `<g class="${group.boxClass}" data-id="${escapeXml(b.id)}">` +
            `<rect class="${boxBoxClass}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" ry="10" />` +
            `<text class="${boxLabelClass}" x="${x}" y="${y}">${escapeXml(label)}</text>` +
            `</g>`
          );
        })
        .join("");
    })
    .join("");

  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));
  const overlayPlan = planOverlayEdges(overlayEdges, nodeById);
  const densePermissionOverlay = (overlayEdges ?? []).filter((edge) => edge.className?.includes("archmap-permission-edge")).length > 8;
  const edgePaths = buildEdgePaths([...layout.edges, ...overlayPlan.drawables]);
  const edgesSvg = layout.edges
    .map((e) => {
      const emph = emphasizeEdges?.has(e.id) ?? false;
      const cls = `archmap-edge${channelClass(e.id, emphasizeEdges)}`;
      const path = edgePathFromD(edgePaths.get(e.id) ?? "", emph ? "archmap-arrow-emph" : "archmap-arrow");
      const startpoint = edgeStartpointSvg(e.points[0]);
      const label = e.label ? edgeLabelSvg(e.label, e.labelAt, e.labelOrient) : "";
      return `<g class="${cls}" data-id="${escapeXml(e.id)}">${path}${startpoint}${label}</g>`;
    })
    .join("");

  const overlayEdgesSvg = renderOverlayEdges(overlayPlan, edgePaths, densePermissionOverlay);

  const nodesSvg = layout.nodes
    .map((n) => {
      const node = nodeSvg(n, channelClass(n.id, emphasizeNodes).trim(), nodeIcons?.get(n.id)?.key);
      const badge = nodeBadges?.get(n.id);
      return badge ? node + nodeBadgeSvg(n, badge) : node;
    })
    .join("");

  // Symbol defs for every distinct icon used (deduped by key).
  const iconDefs = nodeIcons
    ? [...new Map([...nodeIcons.values()].map((r) => [r.key, r])).values()]
        .map(
          (r) =>
            `<symbol id="${iconDomId(r.key)}" viewBox="${r.icon.viewBox}">${r.icon.body}</symbol>`,
        )
        .join("")
    : "";

  return (
    `<svg class="archmap archmap-view-${viewClass}" viewBox="0 0 ${layout.width.toFixed(0)} ${layout.height.toFixed(0)}" ` +
    `width="${layout.width.toFixed(0)}" height="${layout.height.toFixed(0)}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs>${MARKERS}${iconDefs}</defs>` +
    `<style>${DEFAULT_STYLE}</style>` +
    `<g class="archmap-boxes">${boxesSvg}</g>` +
    `<g class="archmap-edges">${edgesSvg}</g>` +
    `<g class="archmap-overlay-edges">${overlayEdgesSvg}</g>` +
    `<g class="archmap-nodes">${nodesSvg}</g>` +
    `</svg>`
  );
}
