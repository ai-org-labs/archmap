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
  return `<g class="${cls}" data-id="${escapeXml(n.id)}">${shape}${centeredLabel(n)}${icon}</g>`;
}

export function edgePathSvg(points: { x: number; y: number }[], markerId = "archmap-arrow"): string {
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return edgePathFromD(d, markerId);
}

/** Build the edge `<path>` from a precomputed `d` (used for crossing gaps). */
export function edgePathFromD(d: string, markerId = "archmap-arrow"): string {
  return `<path class="archmap-edge-path" d="${d}" marker-end="url(#${markerId})" fill="none" />`;
}

interface Seg {
  edgeId: string;
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
    segs.push({ edgeId, x0, y0, x1, y1, orient });
  }
  return segs;
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
  const allSegs = edges.flatMap((e) => segmentsOf(e.id, e.points));
  const verticals = allSegs.filter((s) => s.orient === "v");
  const result = new Map<string, string>();

  for (const e of edges) {
    if (e.points.length === 0) {
      result.set(e.id, "");
      continue;
    }
    const segs = segmentsOf(e.id, e.points);
    let d = `M ${e.points[0].x.toFixed(1)} ${e.points[0].y.toFixed(1)}`;

    for (const s of segs) {
      if (s.orient !== "h") {
        d += ` L ${s.x1.toFixed(1)} ${s.y1.toFixed(1)}`;
        continue;
      }
      const y = s.y0;
      const lo = Math.min(s.x0, s.x1);
      const hi = Math.max(s.x0, s.x1);
      const dir = Math.sign(s.x1 - s.x0) || 1;
      const crosses = verticals
        .filter((v) => v.edgeId !== s.edgeId)
        .filter((v) => v.x0 > lo + gap && v.x0 < hi - gap)
        .filter((v) => y > Math.min(v.y0, v.y1) + 1 && y < Math.max(v.y0, v.y1) - 1)
        .map((v) => v.x0)
        .sort((a, b) => (a - b) * dir);
      for (const cx of crosses) {
        d += ` L ${(cx - dir * gap).toFixed(1)} ${y.toFixed(1)}`;
        d += ` M ${(cx + dir * gap).toFixed(1)} ${y.toFixed(1)}`;
      }
      d += ` L ${s.x1.toFixed(1)} ${s.y1.toFixed(1)}`;
    }
    result.set(e.id, d);
  }
  return result;
}

/** A small caption rendered below a node (e.g. data classification). */
export function nodeBadgeSvg(n: LayoutNode, text: string): string {
  const cx = n.x + n.w / 2;
  const y = n.y + n.h + 12;
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
.archmap-zone-box { fill: var(--archmap-zone-fill, rgba(120,140,170,0.08)); stroke: var(--archmap-zone-stroke, #8aa0c0); stroke-width: 1; stroke-dasharray: 4 4; rx: 10; }
.archmap-zone-label { fill: var(--archmap-zone-label, #5b6b86); font: 600 12px var(--archmap-font, system-ui, sans-serif); }
.archmap-node-shape { fill: var(--archmap-node-fill, #ffffff); stroke: var(--archmap-node-stroke, #3a4a63); stroke-width: 1.5; }
.archmap-node-shape-top { stroke: var(--archmap-node-stroke, #3a4a63); stroke-width: 1.5; }
.archmap-node-label { fill: var(--archmap-node-label, #1c2733); font: 500 13px var(--archmap-font, system-ui, sans-serif); }
.archmap-edge-path { stroke: var(--archmap-edge-stroke, #5b6b86); stroke-width: 1.5; }
.archmap-arrowhead { fill: var(--archmap-edge-stroke, #5b6b86); }
.archmap-edge-label text { fill: var(--archmap-edge-label, #3a4a63); font: 400 11px var(--archmap-font, system-ui, sans-serif); }
.archmap-edge-label-bg { fill: var(--archmap-bg, #ffffff); opacity: 0.85; }
.archmap-faded { opacity: 0.18; }
.archmap-boundary-box { fill: var(--archmap-boundary-fill, rgba(200,90,70,0.05)); stroke: var(--archmap-boundary-stroke, #c85a46); stroke-width: 1.5; stroke-dasharray: 2 3; }
.archmap-boundary-label { fill: var(--archmap-boundary-label, #b3261e); font: 600 12px var(--archmap-font, system-ui, sans-serif); }
.archmap-emphasis .archmap-node-shape, .archmap-emphasis .archmap-node-shape-top { stroke: var(--archmap-emphasis, #b3261e); stroke-width: 2.5; }
.archmap-emphasis .archmap-edge-path { stroke: var(--archmap-emphasis, #b3261e); stroke-width: 2.5; }
.archmap-arrowhead-emph { fill: var(--archmap-emphasis, #b3261e); }
.archmap-badge { fill: var(--archmap-badge, #7a4f9a); font: 600 10px var(--archmap-font, system-ui, sans-serif); }
.archmap-overlay-edge .archmap-edge-path { stroke: var(--archmap-permission, #7a4f9a); stroke-width: 2; stroke-dasharray: 6 4; }
.archmap-overlay-edge .archmap-edge-label text { fill: var(--archmap-permission, #7a4f9a); font-weight: 600; }
`.trim();
