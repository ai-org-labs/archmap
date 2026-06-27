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
  edgeBadgesSize,
  edgeBadgesSvg,
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
  depth?: number;
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
  /** Edge id -> compact semantic badges rendered near the edge. */
  edgeBadges?: Map<string, Array<{ kind: "auth-summary"; label: string; title?: string }>>;
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
type EdgeBadgeList = NonNullable<DiagramSpec["edgeBadges"]> extends Map<string, infer V> ? V : never;
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
  permissionSummaryTargets: Map<string, LayoutNode>;
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

function overlapArea(a: Box, b: Box): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

function boxesOverlap(a: Box, b: Box): boolean {
  return overlapArea(a, b) > 0;
}

function placeEdgeBadges(badges: EdgeBadgeList, at: { x: number; y: number }, reserved: Box[]): { x: number; y: number; box: Box } {
  const size = edgeBadgesSize(badges);
  const candidates = [
    { dx: 0, dy: 13 },
    { dx: 0, dy: -34 },
    { dx: 0, dy: 38 },
    { dx: 0, dy: -58 },
    { dx: 72, dy: 13 },
    { dx: -72, dy: 13 },
    { dx: 72, dy: -34 },
    { dx: -72, dy: -34 },
    { dx: 120, dy: 38 },
    { dx: -120, dy: 38 },
  ];
  for (const candidate of candidates) {
    const x = at.x + candidate.dx;
    const y = at.y + candidate.dy;
    const box: Box = { id: "", x: x - size.w / 2 - 2, y: y - 2, w: size.w + 4, h: size.h + 4 };
    if (!reserved.some((other) => boxesOverlap(box, other))) return { x, y, box };
  }
  const fallback = candidates[candidates.length - 1];
  const x = at.x + fallback.dx;
  const y = at.y + fallback.dy + reserved.length * 22;
  return { x, y, box: { id: "", x: x - size.w / 2 - 2, y: y - 2, w: size.w + 4, h: size.h + 4 } };
}

function segmentIntersectsBox(a: { x: number; y: number }, b: { x: number; y: number }, box: Box): boolean {
  const x0 = box.x;
  const y0 = box.y;
  const x1 = box.x + box.w;
  const y1 = box.y + box.h;
  if (Math.max(a.x, b.x) < x0 || Math.min(a.x, b.x) > x1 || Math.max(a.y, b.y) < y0 || Math.min(a.y, b.y) > y1) return false;
  if ((a.x >= x0 && a.x <= x1 && a.y >= y0 && a.y <= y1) || (b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1)) return true;
  if (Math.abs(a.x - b.x) < 0.5) return a.x >= x0 && a.x <= x1 && Math.max(a.y, b.y) >= y0 && Math.min(a.y, b.y) <= y1;
  if (Math.abs(a.y - b.y) < 0.5) return a.y >= y0 && a.y <= y1 && Math.max(a.x, b.x) >= x0 && Math.min(a.x, b.x) <= x1;
  return false;
}

function edgeSegments(layout: LayoutResult): Array<[{ x: number; y: number }, { x: number; y: number }]> {
  return layout.edges.flatMap((edge) =>
    edge.points.slice(0, -1).map((point, i): [{ x: number; y: number }, { x: number; y: number }] => [point, edge.points[i + 1]]),
  );
}

function placeBoxLabel(
  label: string,
  box: Box,
  reserved: Box[],
  blockers: Box[],
  segments: Array<[{ x: number; y: number }, { x: number; y: number }]>,
): { x: number; y: number; box: Box } {
  const labelBox = (x: number, y: number): Box => textBox(label, x, y);
  const width = labelBox(0, 0).w;
  const left = box.x + 10;
  const center = box.x + Math.max(10, (box.w - width) / 2);
  const right = box.x + Math.max(10, box.w - width - 8);
  const xMin = box.x + 8;
  const xMax = Math.max(xMin, box.x + box.w - width - 4);
  const xs = [...new Set([
    left,
    center,
    right,
    box.x + box.w * 0.25,
    box.x + box.w * 0.75 - width,
  ].map((x) => Math.max(xMin, Math.min(xMax, x))))];
  const yRows: number[] = [];
  for (let y = box.y + 18; y <= box.y + box.h - 8; y += 16) yRows.push(y);
  if (yRows.length === 0) yRows.push(box.y + 18);
  const candidates = yRows.flatMap((y) => xs.map((x) => ({ x, y })));
  let best = { x: left, y: box.y + 18, score: Number.POSITIVE_INFINITY, box: labelBox(left, box.y + 18) };
  for (const candidate of candidates) {
    const tb = labelBox(candidate.x, candidate.y);
    const labelOverlap = reserved.reduce((sum, other) => sum + overlapArea(tb, other), 0);
    const blockerOverlap = blockers.reduce((sum, other) => sum + overlapArea(tb, other), 0);
    const lineHits = segments.filter(([a, b]) => segmentIntersectsBox(a, b, tb)).length;
    const distance = Math.abs(candidate.x - left) * 0.15 + Math.abs(candidate.y - (box.y + 18));
    const score = labelOverlap * 2400 + blockerOverlap * 450 + lineHits * 900 + distance;
    if (score < best.score) best = { ...candidate, score, box: tb };
    if (score === distance) break;
  }
  return best;
}

function planOverlayEdges(edges: OverlayEdge[] | undefined, nodeById: Map<string, LayoutNode>): OverlayPlan {
  if (!edges?.length) return { drawables: [], permissionLabelsByTarget: new Map(), permissionSummaryTargets: new Map(), targetSlot: new Map() };
  const permissionEdges = edges.filter((edge) => edge.className?.includes("archmap-permission-edge"));
  const summarizePermissionOverlay = permissionEdges.length > 0;
  const permissionLabelsByTarget = new Map<string, string[]>();
  const permissionSummaryTargets = new Map<string, LayoutNode>();
  if (summarizePermissionOverlay) {
    for (const edge of permissionEdges) {
      if (!edge.label) continue;
      permissionLabelsByTarget.set(edge.to, [...(permissionLabelsByTarget.get(edge.to) ?? []), edge.label]);
      const target = nodeById.get(edge.to);
      if (target) permissionSummaryTargets.set(edge.to, target);
    }
  }
  const drawableEdges = summarizePermissionOverlay
    ? edges.filter((edge) => !edge.className?.includes("archmap-permission-edge"))
    : edges;
  const sourcePorts = new Map<string, Port[]>();
  const targetPorts = new Map<string, Port[]>();
  const resolved = drawableEdges.map((edge, index) => {
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

  return { drawables, permissionLabelsByTarget, permissionSummaryTargets, targetSlot };
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
      return (
        `<g class="${cls}" data-id="${escapeXml(entry.edge.id)}" data-from="${escapeXml(entry.edge.from)}" data-to="${escapeXml(entry.edge.to)}">` +
        `${edgePathFromD(d, "archmap-arrow-emph")}${edgeStartpointSvg(entry.source)}${label}</g>`
      );
    })
    .join("") +
    [...plan.permissionLabelsByTarget.entries()]
      .map(([target, labels]) => {
        const node = plan.permissionSummaryTargets.get(target) ?? plan.drawables.find((item) => item.entry.to.id === target)?.entry.to;
        return node ? permissionSummarySvg(node, labels) : "";
      })
      .join("");
}

export function renderDiagram(spec: DiagramSpec): string {
  const { layout, viewClass, boxes, boxClass = "archmap-zone", emphasizeNodes, emphasizeEdges, nodeBadges, edgeBadges, overlayEdges, nodeIcons } = spec;
  const boxGroups = spec.boxGroups ?? (boxes ? [{ boxes, boxClass }] : []);
  const reservedBoxLabels: Box[] = [];
  const boxLabelBlockers: Box[] = [
    ...layout.nodes.map((n) => ({ id: n.id, x: n.x - 4, y: n.y - 4, w: n.w + 8, h: n.h + 8 })),
    ...layout.edges.filter((e) => e.label).map((e) => textBox(e.label!, e.labelAt.x, e.labelAt.y)),
  ];
  const boxLabelSegments = edgeSegments(layout);

  const boxesSvg = boxGroups
    .map((group) => {
      const boxLabelClass = group.boxClass === "archmap-boundary" ? "archmap-boundary-label" : "archmap-zone-label";
      const resolvedLabelClass = group.boxClass === "archmap-layer"
        ? "archmap-layer-label"
        : boxLabelClass;
      const boxBoxClass = group.boxClass === "archmap-boundary"
        ? "archmap-boundary-box"
        : group.boxClass === "archmap-layer" ? "archmap-layer-box"
          : "archmap-zone-box";
      return group.boxes
        .map((b) => {
          const label = b.label ?? b.id;
          const placedLabel = placeBoxLabel(label, b, reservedBoxLabels, boxLabelBlockers, boxLabelSegments);
          reservedBoxLabels.push(placedLabel.box);
          const depth = Math.max(0, Math.min(9, Math.floor(b.depth ?? 0)));
          return (
            `<g class="${group.boxClass} ${group.boxClass}-depth-${depth}" data-id="${escapeXml(b.id)}" data-depth="${depth}">` +
            `<rect class="${boxBoxClass}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="14" ry="14" />` +
            `<text class="${resolvedLabelClass}" x="${placedLabel.x}" y="${placedLabel.y}">${escapeXml(label)}</text>` +
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
  const reservedEdgeBadges: Box[] = [];
  const edgesSvg = layout.edges
    .map((e) => {
      const emph = emphasizeEdges?.has(e.id) ?? false;
      const cls = `archmap-edge${channelClass(e.id, emphasizeEdges)}`;
      const path = edgePathFromD(edgePaths.get(e.id) ?? "", emph ? "archmap-arrow-emph" : "archmap-arrow");
      const startpoint = edgeStartpointSvg(e.points[0]);
      const label = e.label ? edgeLabelSvg(e.label, e.labelAt, e.labelOrient) : "";
      const badges = edgeBadges?.get(e.id);
      const placedBadges = badges ? placeEdgeBadges(badges, e.labelAt, reservedEdgeBadges) : undefined;
      if (placedBadges) reservedEdgeBadges.push(placedBadges.box);
      const badgeSvg = badges && placedBadges ? edgeBadgesSvg(badges, placedBadges) : "";
      return `<g class="${cls}" data-id="${escapeXml(e.id)}" data-from="${escapeXml(e.from)}" data-to="${escapeXml(e.to)}">${path}${startpoint}${label}${badgeSvg}</g>`;
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
