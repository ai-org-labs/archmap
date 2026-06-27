/**
 * Shared SVG building helpers for 2D views. Pure string output so views are
 * testable without a DOM; the runtime injects the string into a target.
 */

import type { LayoutNode } from "../layout.js";
import { iconDomId } from "../icons.js";

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function centeredLabel(n: LayoutNode, cls = "archmap-node-label"): string {
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  return `<text class="${cls}" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${escapeXml(n.label)}</text>`;
}

/** A small vendor/provider icon badge in the node's top-left corner. */
function iconBadgeSvg(n: LayoutNode, iconKey: string): string {
  const size = 18;
  const x = n.x + 7;
  const y = n.y + 7;
  return `<use class="archmap-node-icon" href="#${iconDomId(iconKey)}" x="${x}" y="${y}" width="${size}" height="${size}" />`;
}

/** Render a node's shape + label group. `extraClass` lets views fade/emphasize. */
export function nodeSvg(n: LayoutNode, extraClass = "", iconKey?: string): string {
  const cls = `archmap-node archmap-shape-${n.shape}${extraClass ? " " + extraClass : ""}`;
  const { x, y, w, h } = n;
  let shape: string;
  switch (n.shape) {
    case "database": {
      const ry = Math.min(10, h / 6);
      // Cylinder: body rect + top/bottom ellipses approximated with a path.
      shape =
        `<path class="archmap-node-shape" d="` +
        `M ${x} ${y + ry} ` +
        `A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + ry} ` +
        `L ${x + w} ${y + h - ry} ` +
        `A ${w / 2} ${ry} 0 0 1 ${x} ${y + h - ry} ` +
        `Z" />` +
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
  const icon = iconKey ? iconBadgeSvg(n, iconKey) : "";
  return (
    `<g class="${cls}" data-id="${escapeXml(n.id)}" ` +
    `data-x="${x.toFixed(1)}" data-y="${y.toFixed(1)}" data-w="${w.toFixed(1)}" data-h="${h.toFixed(1)}">` +
    `${shape}${centeredLabel(n)}${icon}</g>`
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

function parallelOffsets(allSegs: Seg[], spacing = 6): WeakMap<Seg, number> {
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
  const protectedStub = 14;
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
  const segsByEdge = new Map(edges.map((e) => [e.id, segmentsOf(e.id, e.points)]));
  const allSegs = [...segsByEdge.values()].flat();
  const offsets = parallelOffsets(allSegs);
  const routed = new Map(edges.map((e) => [e.id, offsetPolyline(e.points, segsByEdge.get(e.id) ?? [], offsets)]));
  const routedSegs = new Map(edges.map((e) => [e.id, segmentsOf(e.id, routed.get(e.id) ?? e.points)]));
  const verticals = [...routedSegs.values()].flat().filter((s) => s.orient === "v");
  const result = new Map<string, string>();

  for (const e of edges) {
    if (e.points.length === 0) {
      result.set(e.id, "");
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
    result.set(e.id, d);
  }
  return result;
}

/** A small caption rendered below a node (e.g. data classification). */
export function nodeBadgeSvg(n: LayoutNode, text: string): string {
  const cx = n.x + n.w / 2;
  const y = n.y + n.h + 12;
  if (text.startsWith("auth:")) {
    const label = text.slice("auth:".length);
    const w = Math.max(54, label.length * 7 + 30);
    const h = 20;
    const x = cx - w / 2;
    const rectY = y - 14;
    const iconX = x + 13;
    const textX = x + 27;
    return (
      `<g class="archmap-badge archmap-auth-badge">` +
      `<rect x="${x.toFixed(1)}" y="${rectY.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="10" />` +
      `<circle class="archmap-auth-badge-icon" cx="${iconX.toFixed(1)}" cy="${(rectY + 8).toFixed(1)}" r="4" />` +
      `<path class="archmap-auth-badge-icon" d="M ${iconX.toFixed(1)} ${(rectY + 12).toFixed(1)} v 4 h 7 v -4 z" />` +
      `<text x="${textX.toFixed(1)}" y="${(rectY + h / 2 + 0.5).toFixed(1)}" dominant-baseline="central">${escapeXml(label)}</text>` +
      `</g>`
    );
  }
  return `<text class="archmap-badge" x="${cx.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${escapeXml(text)}</text>`;
}

export function edgeLabelSvg(text: string, at: { x: number; y: number }, orient: "h" | "v" = "h"): string {
  const w = text.length * 6.5 + 8;
  // For a vertical run, place the label to the right of the line (left-aligned)
  // so the line stays visible; for a horizontal run it sits centered above.
  const bgX = orient === "v" ? at.x - 2 : at.x - w / 2;
  const textX = orient === "v" ? at.x + 2 : at.x;
  const anchor = orient === "v" ? "start" : "middle";
  return (
    `<g class="archmap-edge-label">` +
    `<rect class="archmap-edge-label-bg" x="${bgX.toFixed(1)}" y="${(at.y - 9).toFixed(1)}" width="${w.toFixed(1)}" height="18" rx="3" />` +
    `<text x="${textX.toFixed(1)}" y="${at.y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="central">${escapeXml(text)}</text>` +
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
.archmap-layer-box { fill: var(--archmap-layer-fill, rgba(236,241,248,0.72)); stroke: var(--archmap-layer-stroke, #b8c5d6); stroke-width: 1.1; }
.archmap-layer-depth-1 .archmap-layer-box { fill: var(--archmap-layer-fill-depth-1, rgba(247,239,222,0.68)); }
.archmap-layer-depth-2 .archmap-layer-box { fill: var(--archmap-layer-fill-depth-2, rgba(232,243,232,0.66)); }
.archmap-layer-depth-3 .archmap-layer-box { fill: var(--archmap-layer-fill-depth-3, rgba(239,233,248,0.66)); }
.archmap-layer-depth-4 .archmap-layer-box { fill: var(--archmap-layer-fill-depth-4, rgba(248,235,235,0.62)); }
.archmap-layer-label { fill: var(--archmap-layer-label, #5f6d7b); font: 700 13px var(--archmap-font, system-ui, sans-serif); }
.archmap-node-shape { fill: var(--archmap-node-fill, #ffffff); stroke: var(--archmap-node-stroke, #3a4a63); stroke-width: 1.5; }
.archmap-node-shape-top { stroke: var(--archmap-node-stroke, #3a4a63); stroke-width: 1.5; }
.archmap-node-label { fill: var(--archmap-node-label, #1c2733); font: 500 13px var(--archmap-font, system-ui, sans-serif); }
.archmap-edge-path { stroke: var(--archmap-edge-stroke, #5b6b86); stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; }
.archmap-edge-startpoint { fill: var(--archmap-edge-stroke, #5b6b86); stroke: none; }
.archmap-arrowhead { fill: var(--archmap-edge-stroke, #5b6b86); }
.archmap-edge-label text { fill: var(--archmap-edge-label, #3a4a63); font: 400 11px var(--archmap-font, system-ui, sans-serif); }
.archmap-edge-label-bg { fill: var(--archmap-bg, #ffffff); opacity: 0.85; }
.archmap-faded { opacity: 0.18; }
.archmap-boundary-box { fill: var(--archmap-boundary-fill, rgba(247,240,220,0.48)); stroke: var(--archmap-boundary-stroke, #c0a044); stroke-width: 1.8; }
.archmap-boundary-label { fill: var(--archmap-boundary-label, #7d704b); font: 700 13px var(--archmap-font, system-ui, sans-serif); }
.archmap-selected .archmap-node-shape, .archmap-selected .archmap-node-shape-top { stroke: var(--archmap-selected, #2563eb); stroke-width: 3; }
.archmap-selected .archmap-zone-box, .archmap-selected .archmap-boundary-box, .archmap-selected .archmap-layer-box { stroke: var(--archmap-selected, #2563eb); stroke-width: 3; }
.archmap-selected .archmap-edge-path { stroke: var(--archmap-selected, #2563eb); stroke-width: 3; }
.archmap-selected .archmap-edge-startpoint { fill: var(--archmap-selected, #2563eb); }
.archmap-emphasis .archmap-node-shape, .archmap-emphasis .archmap-node-shape-top { stroke: var(--archmap-emphasis, #b3261e); stroke-width: 2.5; }
.archmap-emphasis .archmap-edge-path { stroke: var(--archmap-emphasis, #b3261e); stroke-width: 1.8; }
.archmap-emphasis .archmap-edge-startpoint { fill: var(--archmap-emphasis, #b3261e); }
.archmap-arrowhead-emph { fill: var(--archmap-emphasis, #b3261e); }
.archmap-badge { fill: var(--archmap-badge, #7a4f9a); font: 600 10px var(--archmap-font, system-ui, sans-serif); }
.archmap-auth-badge rect { fill: var(--archmap-auth-badge-fill, #fff7ed); stroke: var(--archmap-auth-badge-stroke, #b3261e); stroke-width: 1.2; }
.archmap-auth-badge text { fill: var(--archmap-auth-badge-text, #7f1d1d); font: 800 11px var(--archmap-font, system-ui, sans-serif); letter-spacing: 0; }
.archmap-auth-badge-icon { fill: var(--archmap-auth-badge-stroke, #b3261e); stroke: none; }
.archmap-overlay-edge .archmap-edge-path { stroke: var(--archmap-permission, #7a4f9a); stroke-width: 2; stroke-dasharray: 6 4; }
.archmap-overlay-edge .archmap-edge-startpoint { fill: var(--archmap-permission, #7a4f9a); }
.archmap-overlay-edge .archmap-edge-label text { fill: var(--archmap-permission, #7a4f9a); font-weight: 600; }
.archmap-overlay-summary rect { fill: var(--archmap-bg, #ffffff); stroke: var(--archmap-permission, #7a4f9a); stroke-width: 1; opacity: 0.94; }
.archmap-overlay-summary text { fill: var(--archmap-permission, #7a4f9a); font: 600 10px var(--archmap-font, system-ui, sans-serif); }
`.trim();
