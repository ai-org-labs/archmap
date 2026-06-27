import type { LayoutNode, LayoutPoint, LayoutResult } from "../layout.js";
import type { DiagramSpec } from "./base.js";
import { DEFAULT_STYLE, MARKERS, edgeLabelSvg, edgePathFromD, escapeXml } from "./svg.js";

interface IsoPoint {
  x: number;
  y: number;
}

interface Projector {
  point(p: LayoutPoint, z?: number): IsoPoint;
  boxCorners(b: { x: number; y: number; w: number; h: number; z?: number }): IsoPoint[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  width: number;
  height: number;
}

const FLOOR_HEIGHT = 30;
const EXTRUDE = 10;
const MARGIN = 48;

function rawProject(p: LayoutPoint, z = 0): IsoPoint {
  return {
    x: (p.x - p.y) * 0.72,
    y: (p.x + p.y) * 0.34 - z * FLOOR_HEIGHT,
  };
}

function cornersOf(b: { x: number; y: number; w: number; h: number }): LayoutPoint[] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

function makeProjector(layout: LayoutResult, boxes: Array<{ x: number; y: number; w: number; h: number; z?: number }>): Projector {
  const raw: IsoPoint[] = [];
  for (const n of layout.nodes) raw.push(...cornersOf(n).map((p) => rawProject(p, n.z)));
  for (const e of layout.edges) {
    const from = layout.nodes.find((n) => n.id === e.from);
    const to = layout.nodes.find((n) => n.id === e.to);
    const za = from?.z ?? 0;
    const zb = to?.z ?? za;
    e.points.forEach((p, i) => {
      const t = e.points.length <= 1 ? 0 : i / (e.points.length - 1);
      raw.push(rawProject(p, za + (zb - za) * t));
    });
  }
  for (const b of boxes) raw.push(...cornersOf(b).map((p) => rawProject(p, b.z ?? 0)));
  const minX = Math.min(...raw.map((p) => p.x), 0);
  const minY = Math.min(...raw.map((p) => p.y), 0);
  const maxX = Math.max(...raw.map((p) => p.x), 1);
  const maxY = Math.max(...raw.map((p) => p.y), 1);
  const shiftX = MARGIN - minX;
  const shiftY = MARGIN - minY;
  const project = (p: LayoutPoint, z = 0): IsoPoint => {
    const r = rawProject(p, z);
    return { x: r.x + shiftX, y: r.y + shiftY };
  };
  return {
    point: project,
    boxCorners: (b) => cornersOf(b).map((p) => project(p, b.z ?? 0)),
    bounds: { minX: MARGIN, minY: MARGIN, maxX: maxX + shiftX, maxY: maxY + shiftY },
    width: Math.ceil(maxX - minX + MARGIN * 2),
    height: Math.ceil(maxY - minY + MARGIN * 2 + EXTRUDE),
  };
}

function pointsAttr(points: IsoPoint[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

function pathD(points: IsoPoint[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

function center(n: LayoutNode): LayoutPoint {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

function channelClass(id: string, set: Set<string> | undefined): string {
  if (!set) return "";
  return set.has(id) ? " archmap-emphasis" : " archmap-faded";
}

function nodeIsoSvg(n: LayoutNode, projector: Projector, extraClass = "", badge?: string): string {
  const top = projector.boxCorners(n);
  const bottom = top.map((p) => ({ x: p.x, y: p.y + EXTRUDE }));
  const right = [top[1], top[2], bottom[2], bottom[1]];
  const front = [top[2], top[3], bottom[3], bottom[2]];
  const c = projector.point(center(n), n.z);
  const cls = `archmap-node archmap-isometric-node archmap-shape-${n.shape}${extraClass ? " " + extraClass : ""}`;
  const badgeText = badge
    ? `<text class="archmap-badge" x="${c.x.toFixed(1)}" y="${(c.y + 24).toFixed(1)}" text-anchor="middle">${escapeXml(badge)}</text>`
    : "";
  return (
    `<g class="${cls}" data-id="${escapeXml(n.id)}">` +
    `<polygon class="archmap-isometric-side archmap-isometric-side-right" points="${pointsAttr(right)}" />` +
    `<polygon class="archmap-isometric-side archmap-isometric-side-front" points="${pointsAttr(front)}" />` +
    `<polygon class="archmap-node-shape archmap-isometric-top" points="${pointsAttr(top)}" />` +
    `<text class="archmap-node-label" x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${escapeXml(n.label)}</text>` +
    badgeText +
    `</g>`
  );
}

function boxIsoSvg(
  box: { id: string; label?: string; x: number; y: number; w: number; h: number; z?: number },
  projector: Projector,
  groupClass: string,
): string {
  const points = projector.boxCorners(box);
  const label = projector.point({ x: box.x + 10, y: box.y + 18 }, box.z ?? 0);
  const boxClass = groupClass === "archmap-boundary" ? "archmap-boundary-box" : "archmap-zone-box";
  const labelClass = groupClass === "archmap-boundary" ? "archmap-boundary-label" : "archmap-zone-label";
  return (
    `<g class="${groupClass} archmap-isometric-box" data-id="${escapeXml(box.id)}">` +
    `<polygon class="${boxClass}" points="${pointsAttr(points)}" />` +
    `<text class="${labelClass}" x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}">${escapeXml(box.label ?? box.id)}</text>` +
    `</g>`
  );
}

function edgeIsoSvg(edge: LayoutResult["edges"][number], layout: LayoutResult, projector: Projector, emphasizeEdges?: Set<string>): string {
  const from = layout.nodes.find((n) => n.id === edge.from);
  const to = layout.nodes.find((n) => n.id === edge.to);
  const za = from?.z ?? 0;
  const zb = to?.z ?? za;
  const projected = edge.points.map((p, i) => {
    const t = edge.points.length <= 1 ? 0 : i / (edge.points.length - 1);
    return projector.point(p, za + (zb - za) * t);
  });
  const emph = emphasizeEdges?.has(edge.id) ?? false;
  const cls = `archmap-edge${channelClass(edge.id, emphasizeEdges)}`;
  const labelZ = (za + zb) / 2;
  const labelAt = projector.point(edge.labelAt, labelZ);
  const label = edge.label ? edgeLabelSvg(edge.label, labelAt, edge.labelOrient) : "";
  return `<g class="${cls}" data-id="${escapeXml(edge.id)}">${edgePathFromD(pathD(projected), emph ? "archmap-arrow-emph" : "archmap-arrow")}${label}</g>`;
}

function overlayEdgeIsoSvg(edge: NonNullable<DiagramSpec["overlayEdges"]>[number], layout: LayoutResult, projector: Projector): string {
  const from = layout.nodes.find((n) => n.id === edge.from);
  const to = layout.nodes.find((n) => n.id === edge.to);
  if (!from || !to) return "";
  const a = projector.point(center(from), from.z);
  const b = projector.point(center(to), to.z);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 8 };
  const label = edge.label ? edgeLabelSvg(edge.label, mid, "h") : "";
  return `<g class="${edge.className ?? "archmap-overlay-edge"}" data-id="${escapeXml(edge.id)}">${edgePathFromD(pathD([a, b]), "archmap-arrow-emph")}${label}</g>`;
}

export function renderIsometricDiagram(spec: DiagramSpec): string {
  const { layout, viewClass, emphasizeNodes, emphasizeEdges, nodeBadges, overlayEdges } = spec;
  const boxGroups = spec.boxGroups ?? (spec.boxes ? [{ boxes: spec.boxes, boxClass: spec.boxClass ?? "archmap-zone" }] : []);
  const boxes = boxGroups.flatMap((group) => group.boxes);
  const projector = makeProjector(layout, boxes);
  const boxesSvg = boxGroups
    .map((group) => group.boxes.map((box) => boxIsoSvg(box, projector, group.boxClass)).join(""))
    .join("");
  const edgesSvg = layout.edges.map((edge) => edgeIsoSvg(edge, layout, projector, emphasizeEdges)).join("");
  const overlayEdgesSvg = overlayEdges?.map((edge) => overlayEdgeIsoSvg(edge, layout, projector)).join("") ?? "";
  const nodesSvg = layout.nodes
    .map((node) => nodeIsoSvg(node, projector, channelClass(node.id, emphasizeNodes).trim(), nodeBadges?.get(node.id)))
    .join("");

  return (
    `<svg class="archmap archmap-view-${viewClass} archmap-render-isometric" viewBox="0 0 ${projector.width} ${projector.height}" ` +
    `width="${projector.width}" height="${projector.height}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs>${MARKERS}</defs>` +
    `<style>${DEFAULT_STYLE}
.archmap-render-isometric { background: var(--archmap-bg, #fff); }
.archmap-render-isometric .archmap-zone-box { fill: var(--archmap-zone-fill, rgba(120,140,170,0.10)); }
.archmap-render-isometric .archmap-isometric-side { stroke: var(--archmap-node-stroke, #3a4a63); stroke-width: 1.2; }
.archmap-render-isometric .archmap-isometric-side-right { fill: color-mix(in srgb, var(--archmap-node-fill, #ffffff) 82%, #9aa8bd); }
.archmap-render-isometric .archmap-isometric-side-front { fill: color-mix(in srgb, var(--archmap-node-fill, #ffffff) 72%, #9aa8bd); }
.archmap-render-isometric .archmap-isometric-top { fill: var(--archmap-node-fill, #ffffff); }
.archmap-render-isometric .archmap-edge-path { stroke-width: 2; }
</style>` +
    `<g class="archmap-boxes">${boxesSvg}</g>` +
    `<g class="archmap-edges">${edgesSvg}</g>` +
    `<g class="archmap-overlay-edges">${overlayEdgesSvg}</g>` +
    `<g class="archmap-nodes">${nodesSvg}</g>` +
    `</svg>`
  );
}
