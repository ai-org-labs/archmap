/**
 * Shared SVG building helpers for 2D views. Pure string output so views are
 * testable without a DOM; the runtime injects the string into a target.
 */

import type { LayoutNode } from "../layout.js";
import type { ResolvedIcon } from "../icons.js";
import { iconDomId } from "../icons.js";

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function popupAttrs(label: string, detail: string | undefined): string {
  if (!detail) return "";
  return (
    ` role="button" tabindex="0"` +
    ` data-archmap-popup-title="${escapeXml(label)}"` +
    ` data-archmap-popup-detail="${escapeXml(detail)}"`
  );
}

function centeredLabel(n: LayoutNode, cls = "archmap-node-label", yOffset = 0): string {
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2 + yOffset;
  return `<text class="${cls}" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${escapeXml(n.label)}</text>`;
}

const NODE_ICON_SIZE = 32;
const NODE_ICON_LABEL_GAP = 14;
const NODE_ICON_TEXT_CHAR_W = 6.5;

function leadingIconLabel(n: LayoutNode, cls = "archmap-node-label"): string {
  const estimatedLabelWidth = Math.max(NODE_ICON_TEXT_CHAR_W, n.label.length * NODE_ICON_TEXT_CHAR_W);
  const groupWidth = NODE_ICON_SIZE + NODE_ICON_LABEL_GAP + estimatedLabelWidth;
  const groupX = n.x + Math.max(10, (n.w - groupWidth) / 2);
  const labelX = groupX + NODE_ICON_SIZE + NODE_ICON_LABEL_GAP;
  const cy = n.y + n.h / 2;
  return `<text class="${cls}" x="${labelX.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="start" dominant-baseline="central">${escapeXml(n.label)}</text>`;
}

/** A small vendor/provider icon aligned with the node label row. */
function iconBadgeSvg(n: LayoutNode, iconKey: string): string {
  const estimatedLabelWidth = Math.max(NODE_ICON_TEXT_CHAR_W, n.label.length * NODE_ICON_TEXT_CHAR_W);
  const groupWidth = NODE_ICON_SIZE + NODE_ICON_LABEL_GAP + estimatedLabelWidth;
  const x = n.x + Math.max(10, (n.w - groupWidth) / 2);
  const y = n.y + n.h / 2 - NODE_ICON_SIZE / 2;
  return `<use class="archmap-node-icon" href="#${iconDomId(iconKey)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${NODE_ICON_SIZE}" height="${NODE_ICON_SIZE}" />`;
}

function abstractionIconsSvg(n: LayoutNode, icons: ResolvedIcon[]): string {
  const visible = icons.slice(0, 24);
  if (visible.length === 0) return "";
  const size = 31;
  const gap = 7;
  const cols = Math.min(6, visible.length);
  const rows = Math.ceil(visible.length / cols);
  const gridW = cols * size + (cols - 1) * gap;
  const startX = n.x + Math.max(8, (n.w - gridW) / 2);
  const startY = n.y + 8;
  const title = icons.map((icon) => icon.key).join(", ");
  const uses = visible.map((icon, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = startX + col * (size + gap);
    const y = startY + row * (size + gap);
    return `<use class="archmap-node-icon archmap-abstraction-icon" href="#${iconDomId(icon.key)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${size}" height="${size}" />`;
  }).join("");
  const more = icons.length > visible.length
    ? `<text class="archmap-abstraction-icon-more" x="${(startX + gridW + 7).toFixed(1)}" y="${(startY + rows * (size + gap) - gap - 3).toFixed(1)}">+${icons.length - visible.length}</text>`
    : "";
  return `<g class="archmap-abstraction-icons"><title>${escapeXml(title)}</title>${uses}${more}</g>`;
}

/** Render a node's shape + label group. `extraClass` lets views fade/emphasize. */
export function nodeSvg(n: LayoutNode, extraClass = "", icon?: string | ResolvedIcon | ResolvedIcon[], style?: string): string {
  const abstractionClass = n.abstraction ? " archmap-node-abstraction" : "";
  const cls = `archmap-node archmap-shape-${n.shape}${abstractionClass}${extraClass ? " " + extraClass : ""}`;
  const { x, y, w, h } = n;
  let shape: string;
  switch (n.shape) {
    case "database": {
      const ry = Math.min(10, h / 6);
      // Cylinder: body rect + top/bottom ellipses approximated with paths.
      shape =
        `<path class="archmap-node-shape" d="` +
        `M ${x} ${y + ry} ` +
        `A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + ry} ` +
        `L ${x + w} ${y + h - ry} ` +
        `A ${w / 2} ${ry} 0 0 1 ${x} ${y + h - ry} ` +
        `Z" />` +
        `<ellipse class="archmap-node-shape-top-fill" cx="${x + w / 2}" cy="${y + ry}" rx="${w / 2}" ry="${ry}" />` +
        `<path class="archmap-node-shape-top" d="M ${x} ${y + ry} A ${w / 2} ${ry} 0 0 1 ${x + w} ${y + ry}" fill="none" />`;
      break;
    }
    case "circle":
      shape = `<ellipse class="archmap-node-shape" cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" />`;
      break;
    case "diamond": {
      const mx = x + w / 2;
      const my = y + h / 2;
      shape = `<polygon class="archmap-node-shape" points="${mx},${y} ${x + w},${my} ${mx},${y + h} ${x},${my}" />`;
      break;
    }
    case "rectangle":
    default:
      shape = `<rect class="archmap-node-shape" x="${x}" y="${y}" width="${w}" height="${h}" rx="7" ry="7" />`;
      break;
  }
  const icons = Array.isArray(icon) ? icon : [];
  const singleIconKey = typeof icon === "string" ? icon : !Array.isArray(icon) ? icon?.key : undefined;
  const iconSvg = icons.length > 0
    ? abstractionIconsSvg(n, icons)
    : singleIconKey ? iconBadgeSvg(n, singleIconKey) : "";
  const labelOffset = icons.length > 0 ? Math.min(42, Math.max(14, Math.ceil(icons.length / 6) * 15)) : 0;
  const styleAttr = style ? ` style="${escapeXml(style)}"` : "";
  const abstractionAttrs = n.abstraction
    ? ` data-abstraction-target="${escapeXml(n.abstraction.target)}" data-abstraction-id="${escapeXml(n.abstraction.id)}" data-abstraction-key="${escapeXml(`${n.abstraction.target}:${n.abstraction.id}`)}"`
    : "";
  const labelSvg = icons.length > 0
    ? centeredLabel(n, "archmap-node-label", labelOffset)
    : singleIconKey ? leadingIconLabel(n) : centeredLabel(n, "archmap-node-label");
  return (
    `<g class="${cls}" data-id="${escapeXml(n.id)}"${abstractionAttrs}${styleAttr} ` +
    `data-x="${x.toFixed(1)}" data-y="${y.toFixed(1)}" data-w="${w.toFixed(1)}" data-h="${h.toFixed(1)}">` +
    `${shape}${iconSvg}${labelSvg}</g>`
  );
}

export function edgePathSvg(points: { x: number; y: number }[], markerId = "archmap-arrow"): string {
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return edgePathFromD(d, markerId);
}

/** Build the edge `<path>` from a precomputed `d` (used for crossing gaps). */
export function edgePathFromD(d: string, markerId = "archmap-arrow"): string {
  return `<path class="archmap-edge-path" d="${d}" marker-end="url(#${markerId})" fill="none" />`;
}

export function edgeStartpointSvg(point: { x: number; y: number }): string {
  return `<circle class="archmap-edge-startpoint" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3" />`;
}

interface Seg {
  edgeId: string;
  index: number;
  count: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  orient: "h" | "v" | "diag";
}

function segmentsOf(edgeId: string, points: { x: number; y: number }[]): Seg[] {
  const segs: Seg[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const { x: x0, y: y0 } = points[i];
    const { x: x1, y: y1 } = points[i + 1];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    if (dx < 0.5 && dy < 0.5) continue; // zero-length
    const orient = dy < 0.5 ? "h" : dx < 0.5 ? "v" : "diag";
    segs.push({ edgeId, index: i, count: points.length - 1, x0, y0, x1, y1, orient });
  }
  return segs;
}

function simplifyPoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
    if (out.length >= 2) {
      const prev = out[out.length - 2];
      const collinear =
        (Math.abs(prev.x - last.x) < 0.5 && Math.abs(last.x - p.x) < 0.5) ||
        (Math.abs(prev.y - last.y) < 0.5 && Math.abs(last.y - p.y) < 0.5);
      if (collinear) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

function orthogonalizePoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= 1) return points;
  const out: Array<{ x: number; y: number }> = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const next = points[i];
    if (Math.abs(prev.x - next.x) >= 0.5 && Math.abs(prev.y - next.y) >= 0.5) {
      out.push({ x: prev.x, y: next.y });
    }
    out.push(next);
  }
  return out;
}

const PARALLEL_EDGE_LANE_SPACING = 12;

function parallelOffsets(allSegs: Seg[], spacing = PARALLEL_EDGE_LANE_SPACING): WeakMap<Seg, number> {
  const result = new WeakMap<Seg, number>();
  const groups = new Map<string, Seg[]>();
  for (const seg of allSegs) {
    if (seg.orient === "diag") continue;
    if (seg.count <= 2) continue;
    const lane = seg.orient === "h" ? seg.y0 : seg.x0;
    const key = `${seg.orient}|${Math.round(lane * 2) / 2}`;
    (groups.get(key) ?? (groups.set(key, []), groups.get(key)!)).push(seg);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const ordered = [...group].sort((a, b) => {
      const a0 = a.orient === "h" ? Math.min(a.x0, a.x1) : Math.min(a.y0, a.y1);
      const b0 = b.orient === "h" ? Math.min(b.x0, b.x1) : Math.min(b.y0, b.y1);
      const a1 = a.orient === "h" ? Math.max(a.x0, a.x1) : Math.max(a.y0, a.y1);
      const b1 = b.orient === "h" ? Math.max(b.x0, b.x1) : Math.max(b.y0, b.y1);
      return a0 - b0 || a1 - b1 || a.edgeId.localeCompare(b.edgeId);
    });
    const laneEnds: number[] = [];
    const laneBySeg = new WeakMap<Seg, number>();
    for (const seg of ordered) {
      const start = seg.orient === "h" ? Math.min(seg.x0, seg.x1) : Math.min(seg.y0, seg.y1);
      const end = seg.orient === "h" ? Math.max(seg.x0, seg.x1) : Math.max(seg.y0, seg.y1);
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start + 4);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      laneBySeg.set(seg, lane);
    }
    if (laneEnds.length <= 1) continue;
    for (const seg of group) {
      const lane = laneBySeg.get(seg) ?? 0;
      result.set(seg, (lane - (laneEnds.length - 1) / 2) * spacing);
    }
  }
  return result;
}

function segDistance(seg: Seg): number {
  return Math.abs(seg.x1 - seg.x0) + Math.abs(seg.y1 - seg.y0);
}

function pointAlong(seg: Seg, fromStart: boolean, distance: number): { x: number; y: number } {
  const len = Math.max(segDistance(seg), 1);
  const t = Math.min(Math.max(distance / len, 0), 1);
  if (fromStart) {
    return { x: seg.x0 + (seg.x1 - seg.x0) * t, y: seg.y0 + (seg.y1 - seg.y0) * t };
  }
  return { x: seg.x1 + (seg.x0 - seg.x1) * t, y: seg.y1 + (seg.y0 - seg.y1) * t };
}

function offsetSegmentPoint(seg: Seg, point: { x: number; y: number }, offset: number): { x: number; y: number } {
  if (seg.orient === "h") return { x: point.x, y: point.y + offset };
  if (seg.orient === "v") return { x: point.x + offset, y: point.y };
  return point;
}

function offsetCorner(prev: Seg, next: Seg, prevOffset: number, nextOffset: number): { x: number; y: number } {
  const prevEnd = offsetSegmentPoint(prev, { x: prev.x1, y: prev.y1 }, prevOffset);
  const nextStart = offsetSegmentPoint(next, { x: next.x0, y: next.y0 }, nextOffset);
  if (prev.orient === "h" && next.orient === "v") return { x: nextStart.x, y: prevEnd.y };
  if (prev.orient === "v" && next.orient === "h") return { x: prevEnd.x, y: nextStart.y };
  return nextStart;
}

function offsetPolyline(points: Array<{ x: number; y: number }>, segs: Seg[], offsets: WeakMap<Seg, number>): Array<{ x: number; y: number }> {
  if (segs.length === 0) return points;
  const protectedStub = Math.max(18, PARALLEL_EDGE_LANE_SPACING * 2);
  const out: Array<{ x: number; y: number }> = [points[0]];
  const first = segs[0];
  const firstOffset = offsets.get(first) ?? 0;
  out.push(firstOffset === 0 ? { x: first.x0, y: first.y0 } : pointAlong(first, true, protectedStub));
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const offset = offsets.get(seg) ?? 0;
    if (i < segs.length - 1) {
      const next = segs[i + 1];
      out.push(offsetCorner(seg, next, offset, offsets.get(next) ?? 0));
    } else {
      out.push(offset === 0 ? { x: seg.x1, y: seg.y1 } : offsetSegmentPoint(seg, pointAlong(seg, false, protectedStub), offset));
      if (offset !== 0) out.push(pointAlong(seg, false, protectedStub));
    }
  }
  out.push(points[points.length - 1]);
  return simplifyPoints(orthogonalizePoints(out));
}

/**
 * Build the SVG path `d` for every edge, inserting a small gap in each
 * horizontal segment where a vertical segment of a *different* edge crosses it.
 * Vertical lines pass through continuously; horizontal lines "hop under" — so a
 * crossing reads unambiguously (matches the line-jump convention).
 */
export function buildEdgePaths(
  edges: { id: string; points: { x: number; y: number }[] }[],
  gap = 7,
): Map<string, string> {
  return new Map([...buildEdgeVisuals(edges, gap).entries()].map(([id, visual]) => [id, visual.d]));
}

export interface EdgeVisual {
  d: string;
  points: { x: number; y: number }[];
}

/**
 * Build visible SVG routes and retain the post-offset polyline. Consumers that
 * place labels/badges should use these visual points so annotations follow the
 * rendered connector, not the pre-lane-offset layout route.
 */
export function buildEdgeVisuals(
  edges: { id: string; points: { x: number; y: number }[] }[],
  gap = 7,
): Map<string, EdgeVisual> {
  const segsByEdge = new Map(edges.map((e) => [e.id, segmentsOf(e.id, e.points)]));
  const allSegs = [...segsByEdge.values()].flat();
  const offsets = parallelOffsets(allSegs);
  const routed = new Map(edges.map((e) => [e.id, offsetPolyline(e.points, segsByEdge.get(e.id) ?? [], offsets)]));
  const routedSegs = new Map(edges.map((e) => [e.id, segmentsOf(e.id, routed.get(e.id) ?? e.points)]));
  const verticals = [...routedSegs.values()].flat().filter((s) => s.orient === "v");
  const result = new Map<string, EdgeVisual>();

  for (const e of edges) {
    if (e.points.length === 0) {
      result.set(e.id, { d: "", points: [] });
      continue;
    }
    const points = routed.get(e.id) ?? e.points;
    const segs = routedSegs.get(e.id) ?? [];
    let current = points[0];
    let d = `M ${current.x.toFixed(1)} ${current.y.toFixed(1)}`;
    const lineTo = (p: { x: number; y: number }): void => {
      if (Math.abs(current.x - p.x) < 0.5 && Math.abs(current.y - p.y) < 0.5) return;
      d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      current = p;
    };
    const connectTo = (p: { x: number; y: number }): void => {
      if (Math.abs(current.x - p.x) < 0.5 || Math.abs(current.y - p.y) < 0.5) {
        lineTo(p);
        return;
      }
      lineTo({ x: current.x, y: p.y });
      lineTo(p);
    };

    for (const s of segs) {
      const start = { x: s.x0, y: s.y0 };
      const end = { x: s.x1, y: s.y1 };
      connectTo(start);
      if (s.orient !== "h") {
        lineTo(end);
        continue;
      }
      const y = start.y;
      const lo = Math.min(start.x, end.x);
      const hi = Math.max(start.x, end.x);
      const dir = Math.sign(end.x - start.x) || 1;
      const cornerGuard = 16;
      const crosses = verticals
        .filter((v) => v.edgeId !== s.edgeId)
        .filter((v) => v.x0 > lo + gap && v.x0 < hi - gap)
        .filter((v) => v.x0 > lo + cornerGuard && v.x0 < hi - cornerGuard)
        .filter((v) => y > Math.min(v.y0, v.y1) + 1 && y < Math.max(v.y0, v.y1) - 1)
        .map((v) => v.x0)
        .sort((a, b) => (a - b) * dir);
      for (const cx of crosses) {
        lineTo({ x: cx - dir * gap, y });
        d += ` M ${(cx + dir * gap).toFixed(1)} ${y.toFixed(1)}`;
        current = { x: cx + dir * gap, y };
      }
      lineTo(end);
    }
    result.set(e.id, { d, points });
  }
  return result;
}

/** A small caption rendered below a node (e.g. data classification). */
export function nodeBadgeSvg(n: LayoutNode, text: string): string {
  const cx = n.x + n.w / 2;
  const y = n.y + n.h + 12;
  const [rawLabel, ...titleParts] = text.split("\n");
  const detail = titleParts.join("\n");
  if (text.startsWith("auth:")) {
    const label = rawLabel.slice("auth:".length);
    const w = Math.max(54, label.length * 7 + 30);
    const h = 20;
    const x = cx - w / 2;
    const rectY = y - 14;
    const iconX = x + 13;
    const textX = x + 27;
    return (
      `<g class="archmap-badge archmap-auth-badge${detail ? " archmap-popup-trigger" : ""}"${popupAttrs(label, detail)}>` +
      `<rect x="${x.toFixed(1)}" y="${rectY.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="10" />` +
      `<path class="archmap-auth-badge-icon-stroke" d="M ${(iconX - 5).toFixed(1)} ${(rectY + 11).toFixed(1)} v -3 a 5 5 0 0 1 10 0 v 3" />` +
      `<rect class="archmap-auth-badge-icon-fill" x="${(iconX - 5).toFixed(1)}" y="${(rectY + 11).toFixed(1)}" width="10" height="8" rx="2" />` +
      `<text x="${textX.toFixed(1)}" y="${(rectY + h / 2 + 0.5).toFixed(1)}" dominant-baseline="central">${escapeXml(label)}</text>` +
      `</g>`
    );
  }
  const semantic = rawLabel.match(/^(data|permission|boundary):(.+)$/) ?? rawLabel.match(/^(validation):(error|warning|suggestion|info):(.+)$/);
  if (semantic) {
    const kind = semantic[1];
    const level = kind === "validation" ? semantic[2] : undefined;
    const label = kind === "validation" ? semantic[3] : semantic[2];
    const w = Math.max(64, label.length * 6.5 + 18);
    const h = 18;
    const x = cx - w / 2;
    const rectY = y - 14;
    return (
      `<g class="archmap-badge archmap-${kind}-badge${level ? ` archmap-validation-level-${level}` : ""}${detail ? " archmap-popup-trigger" : ""}"${popupAttrs(label, detail)}>` +
      `<rect x="${x.toFixed(1)}" y="${rectY.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="9" />` +
      `<text x="${cx.toFixed(1)}" y="${(rectY + h / 2 + 0.5).toFixed(1)}" text-anchor="middle" dominant-baseline="central">${escapeXml(label)}</text>` +
      `</g>`
    );
  }
  return `<text class="archmap-badge" x="${cx.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${escapeXml(rawLabel)}</text>`;
}

export interface EdgeBadgeSpec {
  kind: "auth-summary" | "data-summary" | "boundary-summary" | "permission-summary" | "validation-summary";
  label: string;
  title?: string;
  level?: "error" | "warning" | "suggestion" | "info";
}

const EDGE_BADGE_TEXT_X = 26;
const EDGE_BADGE_RIGHT_PAD = 14;
const EDGE_BADGE_H = 20;

function edgeBadgeWidth(label: string): number {
  return Math.max(62, EDGE_BADGE_TEXT_X + label.length * 6.8 + EDGE_BADGE_RIGHT_PAD);
}

function edgeBadgeIcon(kind: EdgeBadgeSpec["kind"], x: number, y: number): string {
  if (kind === "auth-summary") {
    return (
      `<path class="archmap-edge-badge-icon-stroke" d="M ${x} ${y + 1} v -3 a 4 4 0 0 1 8 0 v 3" />` +
      `<rect class="archmap-edge-badge-icon-fill" x="${x}" y="${y + 1}" width="8" height="7" rx="1.5" />`
    );
  }
  if (kind === "data-summary") {
    return `<path class="archmap-edge-badge-icon-stroke" d="M ${x} ${y - 4} a 5 2.4 0 1 0 10 0 v 8 a 5 2.4 0 1 1 -10 0 z M ${x} ${y} a 5 2.4 0 1 0 10 0" />`;
  }
  if (kind === "boundary-summary") {
    return `<path class="archmap-edge-badge-icon-stroke" d="M ${x - 1} ${y - 5} h 11 v 11 h -11 z M ${x + 2} ${y - 7} v 15 M ${x + 7} ${y - 7} v 15" />`;
  }
  if (kind === "permission-summary") {
    return `<path class="archmap-edge-badge-icon-stroke" d="M ${x} ${y} a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0 M ${x + 6} ${y} h 6 M ${x + 10} ${y} v 3" />`;
  }
  return `<path class="archmap-edge-badge-icon-stroke" d="M ${x + 5} ${y - 6} l 6 11 h -12 z M ${x + 5} ${y - 2} v 3 M ${x + 5} ${y + 4} v 1" />`;
}

export function edgeBadgesSize(badges: EdgeBadgeSpec[]): { w: number; h: number } {
  const sizes = badges.map((badge) => edgeBadgeWidth(badge.label));
  return { w: sizes.reduce((sum, size) => sum + size, 0) + 5 * Math.max(0, sizes.length - 1), h: EDGE_BADGE_H };
}

export function edgeBadgesSvg(badges: EdgeBadgeSpec[], at: { x: number; y: number }): string {
  if (badges.length === 0) return "";
  const sizes = badges.map((badge) => edgeBadgeWidth(badge.label));
  const gap = 5;
  const total = sizes.reduce((sum, size) => sum + size, 0) + gap * (sizes.length - 1);
  let x = at.x - total / 2;
  const y = at.y;
  return `<g class="archmap-edge-badges">` + badges.map((badge, index) => {
    const w = sizes[index];
    const rect = `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${EDGE_BADGE_H}" rx="10" />`;
    const icon = edgeBadgeIcon(badge.kind, x + 10, y + 8);
    const text = `<text x="${(x + EDGE_BADGE_TEXT_X).toFixed(1)}" y="${(y + EDGE_BADGE_H / 2 + 0.5).toFixed(1)}" dominant-baseline="central">${escapeXml(badge.label)}</text>`;
    x += w + gap;
    const legacyClass = badge.kind === "auth-summary" ? " archmap-auth-edge-badge" : ` archmap-${badge.kind.replace("-summary", "")}-edge-badge`;
    const levelClass = badge.kind === "validation-summary" && badge.level ? ` archmap-validation-level-${badge.level}` : "";
    const popupClass = badge.title ? " archmap-popup-trigger" : "";
    return `<g class="archmap-edge-badge${legacyClass} archmap-${badge.kind}${levelClass}${popupClass}"${popupAttrs(badge.label, badge.title)}>${rect}${icon}${text}</g>`;
  }).join("") + `</g>`;
}

export function edgeLabelSvg(text: string, at: { x: number; y: number }): string {
  const w = text.length * 6.5 + 8;
  const bgX = at.x - w / 2;
  return (
    `<g class="archmap-edge-label">` +
    `<rect class="archmap-edge-label-bg" x="${bgX.toFixed(1)}" y="${(at.y - 9).toFixed(1)}" width="${w.toFixed(1)}" height="18" rx="3" />` +
    `<text x="${at.x.toFixed(1)}" y="${at.y.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>` +
    `</g>`
  );
}

export const ARROW_MARKER =
  `<marker id="archmap-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
  `<path d="M 0 0 L 10 5 L 0 10 z" class="archmap-arrowhead" /></marker>`;

export const ARROW_MARKER_EMPH =
  `<marker id="archmap-arrow-emph" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">` +
  `<path d="M 0 0 L 10 5 L 0 10 z" class="archmap-arrowhead-emph" /></marker>`;

/** All marker defs, included once per diagram. */
export const MARKERS = ARROW_MARKER + ARROW_MARKER_EMPH;

/** Default theme: CSS variables with sensible fallbacks so the SVG renders standalone. */
export const DEFAULT_STYLE = `
.archmap-zone-box { fill: var(--archmap-zone-fill, rgba(226,238,250,0.62)); stroke: var(--archmap-zone-stroke, #8aa8cc); stroke-width: 1.2; }
.archmap-zone-depth-1 .archmap-zone-box { fill: var(--archmap-zone-fill-depth-1, rgba(249,240,218,0.55)); stroke: var(--archmap-zone-stroke-depth-1, #c7b474); }
.archmap-zone-depth-2 .archmap-zone-box { fill: var(--archmap-zone-fill-depth-2, rgba(235,229,248,0.5)); stroke: var(--archmap-zone-stroke-depth-2, #a799cc); }
.archmap-zone-depth-3 .archmap-zone-box { fill: var(--archmap-zone-fill-depth-3, rgba(226,246,236,0.48)); stroke: var(--archmap-zone-stroke-depth-3, #8fbf9c); }
.archmap-zone-label { fill: var(--archmap-zone-label, #687486); font: 700 13px var(--archmap-font, system-ui, sans-serif); }
.archmap-zone { cursor: pointer; }
.archmap-subgraph-box { fill: var(--archmap-subgraph-fill, rgba(100,116,139,0.11)); stroke: none; }
.archmap-subgraph-depth-1 .archmap-subgraph-box { fill: var(--archmap-subgraph-fill-depth-1, rgba(148,163,184,0.11)); }
.archmap-subgraph-depth-2 .archmap-subgraph-box { fill: var(--archmap-subgraph-fill-depth-2, rgba(71,85,105,0.08)); }
.archmap-subgraph-label { fill: var(--archmap-subgraph-label, #64748b); font: 700 13px var(--archmap-font, system-ui, sans-serif); }
.archmap-subgraph { cursor: pointer; }
.archmap-layer-box { fill: var(--archmap-layer-fill, rgba(236,241,248,0.72)); stroke: var(--archmap-layer-stroke, #b8c5d6); stroke-width: 1.1; }
.archmap-layer-depth-1 .archmap-layer-box { fill: var(--archmap-layer-fill-depth-1, rgba(247,239,222,0.68)); }
.archmap-layer-depth-2 .archmap-layer-box { fill: var(--archmap-layer-fill-depth-2, rgba(232,243,232,0.66)); }
.archmap-layer-depth-3 .archmap-layer-box { fill: var(--archmap-layer-fill-depth-3, rgba(239,233,248,0.66)); }
.archmap-layer-depth-4 .archmap-layer-box { fill: var(--archmap-layer-fill-depth-4, rgba(248,235,235,0.62)); }
.archmap-layer-label { fill: var(--archmap-layer-label, #5f6d7b); font: 700 13px var(--archmap-font, system-ui, sans-serif); }
.archmap-node-shape { fill: var(--archmap-node-fill, #ffffff); stroke: var(--archmap-node-stroke, #3a4a63); stroke-width: 1.5; }
.archmap-node-shape-top-fill { fill: var(--archmap-node-fill, #ffffff); stroke: none; }
.archmap-node-shape-top { stroke: var(--archmap-node-stroke, #3a4a63); stroke-width: 1.5; }
.archmap-node-label { fill: var(--archmap-node-label, #1c2733); font: 500 13px var(--archmap-font, system-ui, sans-serif); }
.archmap-node-abstraction, .archmap-zone[data-id], .archmap-subgraph[data-id] { cursor: pointer; }
.archmap-node-abstraction .archmap-node-shape, .archmap-node-abstraction .archmap-node-shape-top { stroke-width: 3.2; }
.archmap-node-abstraction .archmap-node-label { font-weight: 700; }
.archmap-node-abstraction:hover .archmap-node-shape, .archmap-node-abstraction:hover .archmap-node-shape-top { filter: drop-shadow(0 3px 7px rgba(37,99,235,0.22)); stroke-width: 4; }
.archmap-node-abstraction:hover .archmap-node-label { text-decoration: underline; }
.archmap-zone[data-id]:hover .archmap-zone-box, .archmap-subgraph[data-id]:hover .archmap-subgraph-box { filter: drop-shadow(0 3px 7px rgba(37,99,235,0.18)); stroke-width: 2.6; }
.archmap-zone[data-id]:hover .archmap-zone-label, .archmap-subgraph[data-id]:hover .archmap-subgraph-label { text-decoration: underline; }
.archmap-abstraction-locked .archmap-node-abstraction, .archmap-abstraction-locked .archmap-zone[data-id], .archmap-abstraction-locked .archmap-subgraph[data-id] { cursor: grab; }
.archmap-abstraction-locked .archmap-node-abstraction:hover .archmap-node-shape, .archmap-abstraction-locked .archmap-node-abstraction:hover .archmap-node-shape-top, .archmap-abstraction-locked .archmap-zone[data-id]:hover .archmap-zone-box, .archmap-abstraction-locked .archmap-subgraph[data-id]:hover .archmap-subgraph-box { filter: none; }
.archmap-abstraction-locked .archmap-node-abstraction:hover .archmap-node-label, .archmap-abstraction-locked .archmap-zone[data-id]:hover .archmap-zone-label, .archmap-abstraction-locked .archmap-subgraph[data-id]:hover .archmap-subgraph-label { text-decoration: none; }
.archmap-abstraction-icon { opacity: 0.95; }
.archmap-abstraction-icon-more { fill: var(--archmap-node-label, #1c2733); font: 700 10px var(--archmap-font, system-ui, sans-serif); }
.archmap-edge-path { stroke: var(--archmap-edge-stroke, #5b6b86); stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; }
.archmap-edge-startpoint { fill: var(--archmap-edge-stroke, #5b6b86); stroke: none; }
.archmap-arrowhead { fill: var(--archmap-edge-stroke, #5b6b86); }
.archmap-edge-label text { fill: var(--archmap-edge-label, #3a4a63); font: 400 11px var(--archmap-font, system-ui, sans-serif); }
.archmap-edge-label-bg { fill: var(--archmap-bg, #ffffff); opacity: 0.85; }
.archmap-faded { opacity: 0.18; }
.archmap-phase-absent { opacity: var(--archmap-phase-absent-opacity, 0.12); }
.archmap-phase-absent .archmap-node-shape, .archmap-phase-absent .archmap-node-shape-top, .archmap-phase-absent .archmap-edge-path { stroke-dasharray: 4 4; }
.archmap-lifecycle-planned .archmap-node-shape, .archmap-lifecycle-planned .archmap-node-shape-top { stroke-dasharray: 5 4; }
.archmap-lifecycle-planned .archmap-node-shape { fill-opacity: 0.55; }
.archmap-lifecycle-planned .archmap-edge-path { stroke-dasharray: 5 4; }
.archmap-lifecycle-deprecated .archmap-node-shape { stroke: var(--archmap-lifecycle-deprecated, #b45309); fill: var(--archmap-lifecycle-deprecated-fill, #fef3c7); }
.archmap-lifecycle-deprecated .archmap-node-shape-top { stroke: var(--archmap-lifecycle-deprecated, #b45309); }
.archmap-lifecycle-deprecated .archmap-node-shape-top-fill { fill: var(--archmap-lifecycle-deprecated-fill, #fef3c7); }
.archmap-lifecycle-deprecated .archmap-edge-path { stroke: var(--archmap-lifecycle-deprecated, #b45309); }
.archmap-lifecycle-deprecated .archmap-edge-startpoint { fill: var(--archmap-lifecycle-deprecated, #b45309); }
.archmap-lifecycle-deprecated .archmap-zone-box { stroke: var(--archmap-lifecycle-deprecated, #b45309); }
.archmap-lifecycle-removing .archmap-node-shape, .archmap-lifecycle-removing .archmap-node-shape-top { stroke: var(--archmap-lifecycle-removing, #b91c1c); stroke-dasharray: 5 4; }
.archmap-lifecycle-removing .archmap-edge-path { stroke: var(--archmap-lifecycle-removing, #b91c1c); stroke-dasharray: 5 4; }
.archmap-lifecycle-removing .archmap-edge-startpoint { fill: var(--archmap-lifecycle-removing, #b91c1c); }
.archmap-lifecycle-removing .archmap-zone-box { stroke: var(--archmap-lifecycle-removing, #b91c1c); }
.archmap-boundary-box { fill: var(--archmap-boundary-fill, rgba(247,240,220,0.48)); stroke: var(--archmap-boundary-stroke, #c0a044); stroke-width: 1.8; }
.archmap-boundary-label { fill: var(--archmap-boundary-label, #7d704b); font: 700 13px var(--archmap-font, system-ui, sans-serif); }
.archmap-selected .archmap-node-shape, .archmap-selected .archmap-node-shape-top { stroke: var(--archmap-selected, #2563eb); stroke-width: 3; }
.archmap-selected .archmap-node-shape-top-fill { fill: var(--archmap-node-fill, #ffffff); }
.archmap-selected .archmap-zone-box, .archmap-selected .archmap-boundary-box, .archmap-selected .archmap-layer-box, .archmap-selected .archmap-subgraph-box { stroke: var(--archmap-selected, #2563eb); stroke-width: 3; }
.archmap-selected .archmap-edge-path { stroke: var(--archmap-selected, #2563eb); stroke-width: 3; }
.archmap-selected .archmap-edge-startpoint { fill: var(--archmap-selected, #2563eb); }
.archmap-emphasis .archmap-node-shape, .archmap-emphasis .archmap-node-shape-top { stroke: var(--archmap-emphasis, #b3261e); stroke-width: 2.5; }
.archmap-emphasis .archmap-node-shape-top-fill { fill: var(--archmap-node-fill, #ffffff); }
.archmap-emphasis .archmap-edge-path { stroke: var(--archmap-emphasis, #b3261e); stroke-width: 1.8; }
.archmap-emphasis .archmap-edge-startpoint { fill: var(--archmap-emphasis, #b3261e); }
.archmap-node.archmap-label-endpoint .archmap-node-shape,
.archmap-node.archmap-label-endpoint .archmap-node-shape-top { stroke: var(--archmap-label-endpoint, #2563eb); stroke-width: 3; filter: drop-shadow(0 0 5px rgba(37,99,235,0.32)); }
.archmap-node.archmap-label-endpoint .archmap-node-label { fill: var(--archmap-label-endpoint, #1d4ed8); font-weight: 800; }
.archmap-arrowhead-emph { fill: var(--archmap-emphasis, #b3261e); }
.archmap-badge { fill: var(--archmap-badge, #7a4f9a); font: 600 10px var(--archmap-font, system-ui, sans-serif); }
.archmap-auth-badge rect { fill: var(--archmap-auth-badge-fill, #fff7ed); stroke: var(--archmap-auth-badge-stroke, #b3261e); stroke-width: 1.2; }
.archmap-auth-badge text { fill: var(--archmap-auth-badge-text, #7f1d1d); font: 800 11px var(--archmap-font, system-ui, sans-serif); letter-spacing: 0; }
.archmap-auth-badge-icon-fill { fill: var(--archmap-auth-badge-stroke, #b3261e); stroke: none; }
.archmap-auth-badge-icon-stroke { fill: none; stroke: var(--archmap-auth-badge-stroke, #b3261e); stroke-width: 1.8; stroke-linecap: round; }
.archmap-data-badge rect { fill: var(--archmap-data-badge-fill, #eef9f5); stroke: var(--archmap-data-badge-stroke, #16846d); stroke-width: 1; }
.archmap-data-badge text { fill: var(--archmap-data-badge-text, #0f5f4e); font: 700 10px var(--archmap-font, system-ui, sans-serif); }
.archmap-permission-badge rect { fill: var(--archmap-permission-badge-fill, #f6f0ff); stroke: var(--archmap-permission, #7a4f9a); stroke-width: 1; }
.archmap-permission-badge text { fill: var(--archmap-permission, #7a4f9a); font: 700 10px var(--archmap-font, system-ui, sans-serif); }
.archmap-validation-badge rect { fill: var(--archmap-validation-badge-fill, #fff7ed); stroke: var(--archmap-validation, #c2410c); stroke-width: 1; }
.archmap-validation-badge text { fill: var(--archmap-validation, #c2410c); font: 800 10px var(--archmap-font, system-ui, sans-serif); }
.archmap-validation-level-error { --archmap-validation-level-fill: #fff1f2; --archmap-validation-level-stroke: #b3261e; --archmap-validation-level-text: #7f1d1d; --archmap-validation-level-weight: 900; }
.archmap-validation-level-warning { --archmap-validation-level-fill: #fff7ed; --archmap-validation-level-stroke: #c2410c; --archmap-validation-level-text: #9a3412; --archmap-validation-level-weight: 800; }
.archmap-validation-level-suggestion { --archmap-validation-level-fill: #eff6ff; --archmap-validation-level-stroke: #2563eb; --archmap-validation-level-text: #1d4ed8; --archmap-validation-level-weight: 700; }
.archmap-validation-level-info { --archmap-validation-level-fill: #f1f5f9; --archmap-validation-level-stroke: #64748b; --archmap-validation-level-text: #475569; --archmap-validation-level-weight: 600; }
.archmap-validation-badge.archmap-validation-level-error rect,
.archmap-validation-badge.archmap-validation-level-warning rect,
.archmap-validation-badge.archmap-validation-level-suggestion rect,
.archmap-validation-badge.archmap-validation-level-info rect { fill: var(--archmap-validation-level-fill); stroke: var(--archmap-validation-level-stroke); stroke-width: 1.2; }
.archmap-validation-badge.archmap-validation-level-error text,
.archmap-validation-badge.archmap-validation-level-warning text,
.archmap-validation-badge.archmap-validation-level-suggestion text,
.archmap-validation-badge.archmap-validation-level-info text { fill: var(--archmap-validation-level-text); font-weight: var(--archmap-validation-level-weight); }
.archmap-edge-badge rect { fill: var(--archmap-edge-badge-fill, #ffffff); stroke: var(--archmap-edge-badge-stroke, #5b6b86); stroke-width: 1.1; opacity: 0.96; }
.archmap-edge-badge text { fill: var(--archmap-edge-badge-text, #1f2937); font: 800 10px var(--archmap-font, system-ui, sans-serif); letter-spacing: 0; }
.archmap-edge-badge-icon-stroke { fill: none; stroke: var(--archmap-edge-badge-stroke, #5b6b86); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.archmap-edge-badge-icon-fill { fill: var(--archmap-edge-badge-stroke, #5b6b86); stroke: none; }
.archmap-popup-trigger { cursor: pointer; }
.archmap-popup-trigger:focus rect { stroke-width: 2; }
.archmap-auth-summary { --archmap-edge-badge-fill: var(--archmap-auth-badge-fill, #fff7ed); --archmap-edge-badge-stroke: var(--archmap-auth-badge-stroke, #b3261e); --archmap-edge-badge-text: var(--archmap-auth-badge-text, #7f1d1d); }
.archmap-data-summary { --archmap-edge-badge-fill: var(--archmap-data-badge-fill, #eef9f5); --archmap-edge-badge-stroke: var(--archmap-data-badge-stroke, #16846d); --archmap-edge-badge-text: var(--archmap-data-badge-text, #0f5f4e); }
.archmap-boundary-summary { --archmap-edge-badge-fill: var(--archmap-boundary-badge-fill, #fffaf0); --archmap-edge-badge-stroke: var(--archmap-boundary-stroke, #c0a044); --archmap-edge-badge-text: var(--archmap-boundary-label, #7d704b); }
.archmap-permission-summary { --archmap-edge-badge-fill: var(--archmap-permission-badge-fill, #f6f0ff); --archmap-edge-badge-stroke: var(--archmap-permission, #7a4f9a); --archmap-edge-badge-text: var(--archmap-permission, #7a4f9a); }
.archmap-validation-summary { --archmap-edge-badge-fill: var(--archmap-validation-badge-fill, #fff7ed); --archmap-edge-badge-stroke: var(--archmap-validation, #c2410c); --archmap-edge-badge-text: var(--archmap-validation, #c2410c); }
.archmap-validation-summary.archmap-validation-level-error,
.archmap-validation-summary.archmap-validation-level-warning,
.archmap-validation-summary.archmap-validation-level-suggestion,
.archmap-validation-summary.archmap-validation-level-info { --archmap-edge-badge-fill: var(--archmap-validation-level-fill); --archmap-edge-badge-stroke: var(--archmap-validation-level-stroke); --archmap-edge-badge-text: var(--archmap-validation-level-text); }
.archmap-validation-summary.archmap-validation-level-error text,
.archmap-validation-summary.archmap-validation-level-warning text,
.archmap-validation-summary.archmap-validation-level-suggestion text,
.archmap-validation-summary.archmap-validation-level-info text { font-weight: var(--archmap-validation-level-weight); }
.archmap-overlay-edge .archmap-edge-path { stroke: var(--archmap-permission, #7a4f9a); stroke-width: 2; stroke-dasharray: 6 4; }
.archmap-overlay-edge .archmap-edge-startpoint { fill: var(--archmap-permission, #7a4f9a); }
.archmap-overlay-edge .archmap-edge-label text { fill: var(--archmap-permission, #7a4f9a); font-weight: 600; }
.archmap-overlay-summary rect { fill: var(--archmap-bg, #ffffff); stroke: var(--archmap-permission, #7a4f9a); stroke-width: 1; opacity: 0.94; }
.archmap-overlay-summary text { fill: var(--archmap-permission, #7a4f9a); font: 600 10px var(--archmap-font, system-ui, sans-serif); }
`.trim();
