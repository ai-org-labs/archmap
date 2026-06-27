/**
 * Layout engine (Stage 2).
 *
 * Turns an ArchMapModel into pure geometry: positioned nodes, zone boxes, and
 * edge paths. The result is renderer-agnostic — 2D SVG views consume (x, y),
 * and a future three.js view consumes the same result plus `z` (the semantic
 * layer depth from §10). Keeping `z` here is what makes 3D a drop-in later.
 *
 * v1 ranking is topological (longest-path), so Overview "resembles a normal
 * architecture diagram" (§24.1). Edge routing is straight lines clipped to
 * node borders; orthogonal routing and crossing minimization come later.
 */

import type { ArchMapModel, Direction, NodeShape } from "./types.js";

export interface LayoutNode {
  id: string;
  label: string;
  shape: NodeShape;
  /** Top-left corner (2D). */
  x: number;
  y: number;
  /** Semantic layer depth for 3D; 0 when no/unknown layer. Ignored in 2D. */
  z: number;
  w: number;
  h: number;
}

export interface LayoutZone {
  id: string;
  label?: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  /** Member node ids that were placed (used by the 3D view for the volume). */
  nodeIds: string[];
}

export interface LayoutBoundary {
  id: string;
  label?: string;
  kind?: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
}

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  /** Polyline points; v1 is [start, end]. */
  points: LayoutPoint[];
  /** Where to anchor the edge label (offset off the line, not on it). */
  labelAt: LayoutPoint;
  /** Orientation of the segment the label belongs to, for placement. */
  labelOrient?: "h" | "v";
}

export interface LayoutResult {
  direction: Direction;
  width: number;
  height: number;
  /** Number of distinct layer depths spanned (for 3D); >= 1. */
  depth: number;
  nodes: LayoutNode[];
  zones: LayoutZone[];
  boundaries: LayoutBoundary[];
  edges: LayoutEdge[];
}

export interface LayoutOptions {
  direction?: Direction;
  /** How to assign the primary (flow) axis rank. */
  rankBy?: "topo" | "layer" | "zone";
}

/** §10 layer order, used for `z` depth and optional layer-based ranking. */
const LAYER_ORDER = [
  "client", "edge", "runtime", "data", "messaging",
  "identity", "network", "operations", "external",
];
const LAYER_INDEX = new Map(LAYER_ORDER.map((l, i) => [l, i]));

/** §24.2 recommended zone order, used by the Zone view's banded layout. */
const ZONE_ORDER = [
  "client", "internet", "edge", "gcp", "aws", "azure",
  "onprem", "saas", "partner", "identity", "operations", "unknown",
];

// Geometry constants.
const NODE_H = 48;
const NODE_MIN_W = 96;
const NODE_MAX_W = 260;
const HUB_NODE_MAX_W = 420;
const HUB_NODE_MAX_H = 128;
const CHAR_W = 8;
const NODE_PAD_X = 28;
const RANK_GAP = 110; // gap between bands along the flow axis
const NODE_GAP = 28; // gap between nodes within a band
const LANE_GAP = 78; // gap between zone lanes on the cross axis (clears zone boxes)
const MARGIN = 40;
const ZONE_PAD = 22;
const ZONE_LABEL_PAD = 36;

function nodeWidth(label: string): number {
  return Math.max(NODE_MIN_W, Math.min(NODE_MAX_W, label.length * CHAR_W + NODE_PAD_X * 2));
}

function nodeSize(label: string, degree = 0): { w: number; h: number } {
  const extra = Math.max(0, degree - 4);
  return {
    w: Math.min(HUB_NODE_MAX_W, nodeWidth(label) + extra * 18),
    h: Math.min(HUB_NODE_MAX_H, NODE_H + extra * 10),
  };
}

function layerDepth(layer: string | undefined): number {
  if (!layer) return 0;
  return LAYER_INDEX.get(layer) ?? 0;
}

/**
 * Build a stable zone -> rank function: known zones follow §24.2 order,
 * unknown/custom zones are appended after in first-seen order, and nodes with
 * no zone fall into the trailing "unknown" band.
 */
function buildZoneRank(zones: (string | undefined)[]): (zone: string | undefined) => number {
  const index = new Map<string, number>(ZONE_ORDER.map((z, i) => [z, i]));
  let next = ZONE_ORDER.length;
  for (const z of zones) {
    if (z && !index.has(z)) index.set(z, next++);
  }
  const unknown = index.get("unknown")!;
  return (zone) => (zone ? index.get(zone) ?? unknown : unknown);
}

/**
 * Longest-path ranking (Bellman-Ford style relaxation). Cycles are capped by
 * iterating at most |V| times, so back edges simply stop contributing.
 */
function longestPathRanks(nodeIds: string[], edges: { from: string; to: string }[]): Map<string, number> {
  const rank = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  for (let i = 0; i < nodeIds.length; i++) {
    let changed = false;
    for (const e of edges) {
      const rf = rank.get(e.from);
      const rt = rank.get(e.to);
      if (rf === undefined || rt === undefined) continue;
      if (rt < rf + 1) {
        rank.set(e.to, rf + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return rank;
}

export function computeLayout(model: ArchMapModel, options: LayoutOptions = {}): LayoutResult {
  const direction = options.direction ?? model.direction;
  const horizontal = direction === "LR";
  const rankBy = options.rankBy ?? "topo";

  const nodeIds = model.nodes.map((n) => n.id);
  const validEdges = model.edges.filter(
    (e) => nodeIds.includes(e.from) && nodeIds.includes(e.to),
  );
  const degree = new Map(nodeIds.map((id) => [id, 0]));
  for (const edge of validEdges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  const nodeIdSet = new Set(nodeIds);
  const nodeByPrincipal = new Map<string, string[]>();
  for (const node of model.nodes) {
    if (!node.principal) continue;
    nodeByPrincipal.set(node.principal, [...(nodeByPrincipal.get(node.principal) ?? []), node.id]);
  }
  const identityAttachment = new Map(model.identities.map((identity) => {
    const attached = Array.isArray(identity.attachedTo) ? identity.attachedTo : identity.attachedTo ? [identity.attachedTo] : [];
    return [identity.id, attached.filter((id) => nodeIdSet.has(id))];
  }));
  for (const permission of model.permissions) {
    const resource = typeof permission.resource === "string"
      ? permission.resource
      : permission.resource?.type === "node" ? permission.resource.id : undefined;
    if (!resource || !nodeIdSet.has(resource)) continue;
    const principalNodes = [
      ...(nodeByPrincipal.get(permission.principal) ?? []),
      ...(identityAttachment.get(permission.principal) ?? []),
    ].filter((id, index, ids) => ids.indexOf(id) === index);
    for (const principalNode of principalNodes) {
      if (principalNode === resource) continue;
      degree.set(principalNode, (degree.get(principalNode) ?? 0) + 1);
      degree.set(resource, (degree.get(resource) ?? 0) + 1);
    }
  }
  const sizeById = new Map(model.nodes.map((n) => [n.id, nodeSize(n.label, degree.get(n.id) ?? 0)]));

  // --- Rank (flow axis) -----------------------------------------------------
  const allLayered = model.nodes.length > 0 && model.nodes.every((n) => n.layer);
  let rank: Map<string, number>;
  if (rankBy === "layer" && allLayered) {
    rank = new Map(model.nodes.map((n) => [n.id, layerDepth(n.layer)]));
  } else if (rankBy === "zone") {
    const zoneRank = buildZoneRank(model.nodes.map((n) => n.zone));
    rank = new Map(model.nodes.map((n) => [n.id, zoneRank(n.zone)]));
  } else {
    rank = longestPathRanks(nodeIds, validEdges);
  }

  // Group node indices by rank, preserving model order within a rank, and
  // keeping same-zone nodes adjacent for tidier zone boxes.
  const order = new Map(model.nodes.map((n, i) => [n.id, i]));
  const byRank = new Map<number, typeof model.nodes>();
  for (const n of model.nodes) {
    const r = rank.get(n.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(n);
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b);

  // Zone lanes (swimlanes) on the cross axis, so each zone occupies a disjoint
  // band and zone boxes never overlap. Lanes are ordered by §11 zone order,
  // with custom/zoneless lanes appended in first-seen order.
  const laneKey = (n: { zone?: string }) => n.zone ?? "";
  const seen: string[] = [];
  for (const n of model.nodes) {
    const k = laneKey(n);
    if (!seen.includes(k)) seen.push(k);
  }
  const zoneRankFor = buildZoneRank(model.nodes.map((n) => n.zone));
  const laneOrder = [...seen].sort((a, b) => {
    const ra = a === "" ? Number.MAX_SAFE_INTEGER : zoneRankFor(a);
    const rb = b === "" ? Number.MAX_SAFE_INTEGER : zoneRankFor(b);
    return ra - rb || seen.indexOf(a) - seen.indexOf(b);
  });
  const laneIndex = new Map(laneOrder.map((k, i) => [k, i]));

  for (const r of ranks) {
    byRank.get(r)!.sort((a, b) => {
      const la = laneIndex.get(laneKey(a))!;
      const lb = laneIndex.get(laneKey(b))!;
      if (la !== lb) return la - lb;
      return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    });
  }

  // Crossing reduction: reorder nodes *within their lane* by the barycenter of
  // their neighbors' cross-order (Sugiyama-style sweeps). Lanes and ranks stay
  // fixed, so this only untangles multi-node lane cells — no layout regression.
  {
    const adj = new Map<string, string[]>();
    for (const id of nodeIds) adj.set(id, []);
    for (const e of validEdges) {
      adj.get(e.from)!.push(e.to);
      adj.get(e.to)!.push(e.from);
    }
    const indexOf = new Map<string, number>();
    const reindex = () => {
      for (const r of ranks) byRank.get(r)!.forEach((n, i) => indexOf.set(n.id, i));
    };
    reindex();
    for (let iter = 0; iter < 6; iter++) {
      for (const r of ranks) {
        const nodes = byRank.get(r)!;
        const bary = new Map<string, number>();
        for (const n of nodes) {
          const vals = adj.get(n.id)!.map((id) => indexOf.get(id)).filter((v): v is number => v !== undefined);
          bary.set(n.id, vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : indexOf.get(n.id)!);
        }
        nodes.sort((a, b) => {
          const la = laneIndex.get(laneKey(a))!;
          const lb = laneIndex.get(laneKey(b))!;
          if (la !== lb) return la - lb;
          return (bary.get(a.id)! - bary.get(b.id)!) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
        });
        nodes.forEach((n, i) => indexOf.set(n.id, i));
      }
    }
  }

  // --- Positions ------------------------------------------------------------
  // Cross axis size per band (width for LR, height for TD).
  const laid = new Map<string, LayoutNode>();
  // Per-rank extent along the flow axis = max node size on that axis.
  const bandExtent = new Map<number, number>();
  for (const r of ranks) {
    let ext = 0;
    for (const n of byRank.get(r)!) {
      const size = sizeById.get(n.id)!;
      ext = Math.max(ext, horizontal ? size.w : size.h);
    }
    bandExtent.set(r, ext);
  }
  // Cumulative flow-axis offset for each rank.
  const bandStart = new Map<number, number>();
  {
    let cursor = MARGIN;
    for (const r of ranks) {
      bandStart.set(r, cursor);
      cursor += bandExtent.get(r)! + RANK_GAP;
    }
  }

  // Cross-axis extent each lane needs = max, over ranks, of the summed size of
  // that lane's nodes in a single rank.
  const crossSizeOf = (n: { id: string }) => {
    const size = sizeById.get(n.id)!;
    return horizontal ? size.h : size.w;
  };
  const laneExtent = new Map<string, number>();
  for (const r of ranks) {
    const sums = new Map<string, number>();
    for (const n of byRank.get(r)!) {
      sums.set(laneKey(n), (sums.get(laneKey(n)) ?? 0) + crossSizeOf(n) + NODE_GAP);
    }
    for (const [lane, s] of sums) {
      laneExtent.set(lane, Math.max(laneExtent.get(lane) ?? 0, s - NODE_GAP));
    }
  }
  // Cumulative cross-axis start per lane.
  const laneStart = new Map<string, number>();
  {
    let cursor = MARGIN;
    for (const lane of laneOrder) {
      laneStart.set(lane, cursor);
      cursor += (laneExtent.get(lane) ?? NODE_H) + LANE_GAP;
    }
  }
  const crossTotal = laneOrder.length
    ? laneStart.get(laneOrder[laneOrder.length - 1])! + (laneExtent.get(laneOrder[laneOrder.length - 1]) ?? NODE_H) + MARGIN
    : MARGIN * 2;

  for (const r of ranks) {
    const flow = bandStart.get(r)!;
    const ext = bandExtent.get(r)!;
    // Per-lane running cursor within this rank (nodes are lane-sorted already).
    const laneCursor = new Map<string, number>();
    for (const n of byRank.get(r)!) {
      const { w, h } = sizeById.get(n.id)!;
      const lane = laneKey(n);
      const cs = crossSizeOf(n);
      const cur = laneCursor.get(lane) ?? laneStart.get(lane)!;
      laneCursor.set(lane, cur + cs + NODE_GAP);
      let x: number, y: number;
      if (horizontal) {
        x = flow + (ext - w) / 2; // center node in its band along the flow axis
        y = cur;
      } else {
        x = cur;
        y = flow + (ext - h) / 2;
      }
      laid.set(n.id, { id: n.id, label: n.label, shape: n.shape, x, y, z: layerDepth(n.layer), w, h });
    }
  }
  const crossMax = crossTotal;

  const flowEnd = ranks.length
    ? bandStart.get(ranks[ranks.length - 1])! + bandExtent.get(ranks[ranks.length - 1])! + MARGIN
    : MARGIN * 2;
  const width = horizontal ? flowEnd : crossMax;
  const height = horizontal ? crossMax : flowEnd;

  // --- Zones (bounding boxes of members) ------------------------------------
  const zones: LayoutZone[] = [];
  for (const z of model.zones) {
    const members = (z.contains ?? []).map((id) => laid.get(id)).filter((n): n is LayoutNode => !!n);
    if (members.length === 0) continue;
    const minX = Math.min(...members.map((m) => m.x)) - ZONE_PAD;
    const minY = Math.min(...members.map((m) => m.y)) - ZONE_LABEL_PAD;
    const maxX = Math.max(...members.map((m) => m.x + m.w)) + ZONE_PAD;
    const maxY = Math.max(...members.map((m) => m.y + m.h)) + ZONE_PAD;
    zones.push({
      id: z.id,
      label: z.label ?? z.id,
      x: minX,
      y: minY,
      z: Math.min(...members.map((m) => m.z)),
      w: maxX - minX,
      h: maxY - minY,
      nodeIds: members.map((m) => m.id),
    });
  }

  // --- Boundaries (bounding boxes, resolving nested boundary refs) -----------
  const boundaries: LayoutBoundary[] = [];
  const boundaryById = new Map(model.boundaries.map((b) => [b.id, b]));
  const resolveBoundaryNodes = (id: string, seen: Set<string>): string[] => {
    const b = boundaryById.get(id);
    if (!b || seen.has(id)) return [];
    seen.add(id);
    const ids: string[] = [];
    for (const c of b.contains ?? []) {
      if (laid.has(c)) ids.push(c);
      else if (boundaryById.has(c)) ids.push(...resolveBoundaryNodes(c, seen));
    }
    return ids;
  };
  for (const b of model.boundaries) {
    const memberIds = resolveBoundaryNodes(b.id, new Set());
    const members = memberIds.map((id) => laid.get(id)).filter((n): n is LayoutNode => !!n);
    if (members.length === 0) continue;
    const minX = Math.min(...members.map((m) => m.x)) - ZONE_PAD;
    const minY = Math.min(...members.map((m) => m.y)) - ZONE_LABEL_PAD;
    const maxX = Math.max(...members.map((m) => m.x + m.w)) + ZONE_PAD;
    const maxY = Math.max(...members.map((m) => m.y + m.h)) + ZONE_PAD;
    boundaries.push({
      id: b.id,
      label: b.label ?? b.id,
      kind: b.kind,
      x: minX,
      y: minY,
      z: Math.min(...members.map((m) => m.z)),
      w: maxX - minX,
      h: maxY - minY,
    });
  }

  // --- Edges: orthogonal routing with port + channel distribution -----------
  const nodeLane = new Map(model.nodes.map((n) => [n.id, laneIndex.get(laneKey(n))!]));
  const edges = routeEdges(validEdges, laid, rank, ranks, bandStart, bandExtent, horizontal, nodeLane);
  resolveLabelCollisions(edges, [...laid.values()]);

  const depth = Math.max(1, new Set([...laid.values()].map((n) => n.z)).size);

  return {
    direction,
    width: Math.max(width, MARGIN * 2),
    height: Math.max(height, MARGIN * 2),
    depth,
    nodes: [...laid.values()],
    zones,
    boundaries,
    edges,
  };
}

/** Project a (flow, cross) coordinate pair back to (x, y) for the given axis. */
function toXY(flow: number, cross: number, horizontal: boolean): LayoutPoint {
  return horizontal ? { x: flow, y: cross } : { x: cross, y: flow };
}

// Edge-label box geometry (must match edgeLabelSvg in views/svg.ts).
const LABEL_CHAR_W = 6.5;
const LABEL_PAD = 8;
const LABEL_H = 18;

interface LabelBox { x0: number; x1: number; y0: number; y1: number }

function labelBox(label: string, at: LayoutPoint, orient: "h" | "v" = "h"): LabelBox {
  const w = label.length * LABEL_CHAR_W + LABEL_PAD;
  const x0 = orient === "v" ? at.x - 2 : at.x - w / 2;
  return { x0, x1: x0 + w, y0: at.y - LABEL_H / 2, y1: at.y + LABEL_H / 2 };
}

function inflateBox(box: LabelBox, pad: number): LabelBox {
  return { x0: box.x0 - pad, x1: box.x1 + pad, y0: box.y0 - pad, y1: box.y1 + pad };
}

function overlapArea(a: LabelBox, b: LabelBox): number {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

function pointInBox(p: LayoutPoint, b: LabelBox): boolean {
  return p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
}

function ccw(a: LayoutPoint, b: LayoutPoint, c: LayoutPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a: LayoutPoint, b: LayoutPoint, c: LayoutPoint, d: LayoutPoint): boolean {
  const ab1 = ccw(a, b, c);
  const ab2 = ccw(a, b, d);
  const cd1 = ccw(c, d, a);
  const cd2 = ccw(c, d, b);
  return ab1 * ab2 <= 0 && cd1 * cd2 <= 0;
}

function segmentIntersectsBox(a: LayoutPoint, b: LayoutPoint, box: LabelBox): boolean {
  if (pointInBox(a, box) || pointInBox(b, box)) return true;
  if (Math.max(a.x, b.x) < box.x0 || Math.min(a.x, b.x) > box.x1 || Math.max(a.y, b.y) < box.y0 || Math.min(a.y, b.y) > box.y1) return false;
  const tl = { x: box.x0, y: box.y0 };
  const tr = { x: box.x1, y: box.y0 };
  const br = { x: box.x1, y: box.y1 };
  const bl = { x: box.x0, y: box.y1 };
  return segmentsIntersect(a, b, tl, tr) || segmentsIntersect(a, b, tr, br) || segmentsIntersect(a, b, br, bl) || segmentsIntersect(a, b, bl, tl);
}

/**
 * Place edge labels by trying several positions near the edge and picking the
 * first low-conflict spot. Labels avoid node boxes, earlier labels, and all
 * edge segments; if a diagram is too dense, this degrades to the least bad
 * position instead of piling labels on top of each other.
 */
function resolveLabelCollisions(edges: LayoutEdge[], nodes: LayoutNode[]): void {
  const reserved: LabelBox[] = nodes.map((n) => inflateBox({ x0: n.x, x1: n.x + n.w, y0: n.y, y1: n.y + n.h }, 8));
  const segments = edges.flatMap((e) => e.points.slice(0, -1).map((p, i) => [p, e.points[i + 1]] as const));
  const ordered = [...edges].filter((e) => e.label).sort((a, b) => (b.label!.length - a.label!.length));
  for (const edge of ordered) {
    const label = edge.label!;
    const seg = longestSegment(edge.points);
    const baseOrient = seg.orient;
    const nearby = baseOrient === "h"
      ? [{ x: 0, y: -14 }, { x: 0, y: 18 }, { x: 0, y: -34 }, { x: 0, y: 38 }]
      : [{ x: 14, y: 0 }, { x: -52, y: 0 }, { x: 34, y: 0 }, { x: -72, y: 0 }];
    const candidates: Array<{ x: number; y: number; orient: "h" | "v" }> = nearby.map((o) => ({ ...o, orient: baseOrient }));
    for (const radius of [48, 78, 112, 150, 196, 250]) {
      candidates.push(
        { x: 0, y: -radius, orient: "h" },
        { x: 0, y: radius, orient: "h" },
        { x: -radius, y: 0, orient: "h" },
        { x: radius, y: 0, orient: "h" },
        { x: -radius, y: -radius / 2, orient: "h" },
        { x: radius, y: -radius / 2, orient: "h" },
        { x: -radius, y: radius / 2, orient: "h" },
        { x: radius, y: radius / 2, orient: "h" },
        { x: radius / 2, y: 0, orient: "v" },
        { x: -radius, y: 0, orient: "v" },
        { x: radius / 2, y: -radius / 2, orient: "v" },
        { x: radius / 2, y: radius / 2, orient: "v" },
      );
    }
    let best = { at: edge.labelAt, orient: baseOrient, score: Number.POSITIVE_INFINITY };
    for (const offset of candidates) {
      const at = { x: seg.x + offset.x, y: seg.y + offset.y };
      const box = inflateBox(labelBox(label, at, offset.orient), 3);
      const overlap = reserved.reduce((sum, other) => sum + overlapArea(box, other), 0);
      const lineHits = segments.reduce((sum, [a, b]) => sum + (segmentIntersectsBox(a, b, box) ? 1 : 0), 0);
      const distance = Math.abs(offset.x) + Math.abs(offset.y);
      const score = overlap * 20 + lineHits * 900 + distance;
      if (score < best.score) best = { at, orient: offset.orient, score };
      if (score === distance) break;
    }
    edge.labelAt = best.at;
    edge.labelOrient = best.orient;
    reserved.push(inflateBox(labelBox(label, edge.labelAt, edge.labelOrient), 6));
  }
}

/** Midpoint + orientation of the longest segment of a polyline. */
function longestSegment(points: LayoutPoint[]): { x: number; y: number; orient: "h" | "v" } {
  let best = { x: points[0].x, y: points[0].y, orient: "h" as "h" | "v" };
  let bestLen = -1;
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    const dx = Math.abs(q.x - p.x);
    const dy = Math.abs(q.y - p.y);
    const len = dx + dy;
    if (len > bestLen) {
      bestLen = len;
      best = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, orient: dx >= dy ? "h" : "v" };
    }
  }
  return best;
}

type Face = "fL" | "fH" | "cL" | "cH"; // flow-low/high (left/right), cross-low/high (top/bottom)

/** Drop duplicate and collinear points from an orthogonal polyline. */
function simplifyPolyline(pts: LayoutPoint[]): LayoutPoint[] {
  const out: LayoutPoint[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const last = out[out.length - 1];
    if (Math.abs(p.x - last.x) < 0.5 && Math.abs(p.y - last.y) < 0.5) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const collinear =
        (Math.abs(a.x - last.x) < 0.5 && Math.abs(last.x - p.x) < 0.5) ||
        (Math.abs(a.y - last.y) < 0.5 && Math.abs(last.y - p.y) < 0.5);
      if (collinear) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

/**
 * Orthogonal edge routing on a swimlane grid. Verticals run in column gaps and
 * horizontals run inside lanes or in lane gaps, so lines never cross node boxes.
 *
 * - Every edge leaves its source's flow face (left/right) into the column gap
 *   after the source, where a distinct vertical "trunk" carries it across lanes.
 * - Same-lane edges then enter the target's flow face (H-V-H).
 * - Cross-lane edges run a horizontal in the lane gap next to the target, then
 *   a short vertical into the target's top/bottom face (H-V-H-V) — keeping the
 *   target's in-lane flow clear.
 * - Trunks (per source column) and lane-gap channels (per target) are spread so
 *   parallel runs and same-target edges don't coincide; labels sit off the line.
 */
function routeEdges(
  list: { id: string; from: string; to: string; label?: string }[],
  laid: Map<string, LayoutNode>,
  rankOf: Map<string, number>,
  ranks: number[],
  bandStart: Map<number, number>,
  bandExtent: Map<number, number>,
  horizontal: boolean,
  laneOf: Map<string, number>,
): LayoutEdge[] {
  const colIndex = new Map(ranks.map((r, i) => [r, i]));
  const FACE_INSET = 6;
  const CHANNEL_INSET = 34; // cross-lane horizontal sits this far into the lane gap
  const CHANNEL_SPACING = 11; // separation between same-target lane-gap channels

  const geom = (id: string) => {
    const n = laid.get(id)!;
    const flowLow = horizontal ? n.x : n.y;
    const flowSize = horizontal ? n.w : n.h;
    const crossLow = horizontal ? n.y : n.x;
    const crossSize = horizontal ? n.h : n.w;
    return { flowLow, flowHigh: flowLow + flowSize, flowSize, flowCenter: flowLow + flowSize / 2, crossLow, crossHigh: crossLow + crossSize, crossSize, crossCenter: crossLow + crossSize / 2 };
  };

  // Group node ids by (rank, lane) so we can tell whether a node is the extreme
  // one in its lane cell — a straight drop is only safe past the cell edge.
  const cell = new Map<string, { id: string; cross: number }[]>();
  for (const id of laid.keys()) {
    const key = `${rankOf.get(id)}|${laneOf.get(id)}`;
    (cell.get(key) ?? (cell.set(key, []), cell.get(key)!)).push({ id, cross: geom(id).crossCenter });
  }

  type Mode = "same" | "direct" | "trunk" | "side";
  interface End { node: string; face: Face; flow: number; cross: number }
  interface Plan {
    e: { id: string; from: string; to: string; label?: string };
    mode: Mode;
    forward: boolean;
    targetAbove: boolean;
    src: End;
    dst: End;
    trunk: number; // flow coord of the vertical trunk (same/trunk modes)
    channelCross: number; // cross coord of the lane-gap horizontal (direct/trunk)
  }
  const plans: Plan[] = [];
  const degree = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  const pairOrdinals = new Map<string, number>();
  const unorderedPairKey = (from: string, to: string) => from < to ? `${from}\t${to}` : `${to}\t${from}`;
  for (const e of list) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    const key = unorderedPairKey(e.from, e.to);
    pairOrdinals.set(e.id, pairCounts.get(key) ?? 0);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  const isHub = (id: string) => (degree.get(id) ?? 0) >= 6;
  const isMultiEdgePair = (e: { from: string; to: string }) => e.from !== e.to && (pairCounts.get(unorderedPairKey(e.from, e.to)) ?? 0) > 1;

  const faceToward = (from: ReturnType<typeof geom>, to: ReturnType<typeof geom>): Face => {
    const df = to.flowCenter - from.flowCenter;
    const dc = to.crossCenter - from.crossCenter;
    if (Math.abs(df) >= Math.abs(dc)) return df >= 0 ? "fH" : "fL";
    return dc >= 0 ? "cH" : "cL";
  };
  const faceUse = new Map<string, number>();
  const faceCost = (candidate: Face, preferred: Face): number => {
    if (candidate === preferred) return 0;
    if (
      (candidate === "fL" && preferred === "fH") ||
      (candidate === "fH" && preferred === "fL") ||
      (candidate === "cL" && preferred === "cH") ||
      (candidate === "cH" && preferred === "cL")
    ) return 2;
    return 1;
  };
  const balancedHubFace = (node: string, preferred: Face): Face => {
    const faces: Face[] = ["fL", "fH", "cL", "cH"];
    const best = faces
      .map((face) => ({ face, score: (faceUse.get(`${node}|${face}`) ?? 0) * 4 + faceCost(face, preferred) }))
      .sort((a, b) => a.score - b.score || faceCost(a.face, preferred) - faceCost(b.face, preferred))[0].face;
    faceUse.set(`${node}|${best}`, (faceUse.get(`${node}|${best}`) ?? 0) + 1);
    return best;
  };
  const pairedTrackFace = (preferred: Face, ordinal: number): Face => {
    // Multiple edges between the same two boxes need distinct outside tracks.
    // If the nodes mainly face each other along flow, alternate top/bottom;
    // otherwise alternate left/right.
    const flowAligned = preferred === "fL" || preferred === "fH";
    if (flowAligned) return ordinal % 2 === 0 ? "cL" : "cH";
    return ordinal % 2 === 0 ? "fL" : "fH";
  };

  interface PortEntry { planIndex: number; isSource: boolean; sortKey: number }
  const faces = new Map<string, PortEntry[]>();
  const push = (node: string, face: Face, entry: PortEntry) => {
    const key = `${node}|${face}`;
    (faces.get(key) ?? (faces.set(key, []), faces.get(key)!)).push(entry);
  };

  for (const e of list) {
    const a = geom(e.from);
    const b = geom(e.to);
    const la = laneOf.get(e.from)!;
    const lb = laneOf.get(e.to)!;
    const forward = b.flowCenter >= a.flowCenter;
    const targetAbove = b.crossCenter < a.crossCenter;
    // same lane -> flow faces; adjacent lanes -> direct top/bottom drop;
    // 2+ lanes apart -> route the trunk through a column gap to clear nodes.
    const multiEdgePair = isMultiEdgePair(e);
    let mode: Mode = isHub(e.from) || isHub(e.to) || multiEdgePair ? "side" : la === lb ? "same" : Math.abs(la - lb) === 1 ? "direct" : "trunk";
    if (mode === "direct") {
      // A straight drop is only safe if no sibling in the same lane cell sits
      // between the source and the target; otherwise fall back to the trunk.
      const siblings = cell.get(`${rankOf.get(e.from)}|${la}`) ?? [];
      const blocked = targetAbove
        ? siblings.some((n) => n.id !== e.from && n.cross < a.crossCenter)
        : siblings.some((n) => n.id !== e.from && n.cross > a.crossCenter);
      if (blocked) mode = "trunk";
    }

    let srcFace: Face;
    let dstFace: Face;
    let channelCross: number;
    if (mode === "side") {
      const preferredSrc = faceToward(a, b);
      const preferredDst = faceToward(b, a);
      const ordinal = pairOrdinals.get(e.id) ?? 0;
      srcFace = isHub(e.from) ? balancedHubFace(e.from, preferredSrc) : multiEdgePair ? pairedTrackFace(preferredSrc, ordinal) : preferredSrc;
      dstFace = isHub(e.to) ? balancedHubFace(e.to, preferredDst) : multiEdgePair ? pairedTrackFace(preferredDst, ordinal) : preferredDst;
      channelCross = 0;
    } else if (mode === "same") {
      srcFace = forward ? "fH" : "fL";
      dstFace = forward ? "fL" : "fH";
      channelCross = 0;
    } else if (mode === "direct") {
      srcFace = targetAbove ? "cL" : "cH"; // exit the face that points at the target
      dstFace = targetAbove ? "cH" : "cL";
      channelCross = targetAbove ? (b.crossHigh + a.crossLow) / 2 : (a.crossHigh + b.crossLow) / 2;
    } else {
      srcFace = forward ? "fH" : "fL";
      dstFace = targetAbove ? "cH" : "cL";
      channelCross = targetAbove ? b.crossHigh + CHANNEL_INSET : b.crossLow - CHANNEL_INSET;
    }

    const plan: Plan = {
      e, mode, forward, targetAbove,
      src: { node: e.from, face: srcFace, flow: 0, cross: 0 },
      dst: { node: e.to, face: dstFace, flow: 0, cross: 0 },
      trunk: (forward ? a.flowHigh + b.flowLow : a.flowLow + b.flowHigh) / 2,
      channelCross,
    };
    const i = plans.push(plan) - 1;
    // Flow faces order by the other end's cross; cross faces by the other end's flow.
    push(e.from, srcFace, { planIndex: i, isSource: true, sortKey: srcFace[0] === "f" ? b.crossCenter : b.flowCenter });
    push(e.to, dstFace, { planIndex: i, isSource: false, sortKey: dstFace[0] === "f" ? a.crossCenter : a.flowCenter });
  }

  // Distribute ports along each face (cross faces vary in flow, flow faces in cross).
  for (const [key, entries] of faces) {
    const sep = key.lastIndexOf("|");
    const g = geom(key.slice(0, sep));
    const face = key.slice(sep + 1) as Face;
    const varyFlow = face === "cL" || face === "cH";
    const low = varyFlow ? g.flowLow : g.crossLow;
    const size = varyFlow ? g.flowSize : g.crossSize;
    const fixed = face === "fL" ? g.flowLow : face === "fH" ? g.flowHigh : face === "cL" ? g.crossLow : g.crossHigh;
    entries.sort((p, q) => p.sortKey - q.sortKey);
    const span = size - FACE_INSET * 2;
    const n = entries.length;
    entries.forEach((entry, i) => {
      const pos = low + FACE_INSET + (n === 1 ? span / 2 : (span * i) / (n - 1));
      const end = entry.isSource ? plans[entry.planIndex].src : plans[entry.planIndex].dst;
      if (varyFlow) { end.flow = pos; end.cross = fixed; }
      else { end.cross = pos; end.flow = fixed; }
    });
  }

  // Distribute vertical trunks for forward same/trunk edges in the column gap.
  const byCol = new Map<number, number[]>();
  plans.forEach((plan, i) => {
    if (plan.mode === "direct" || plan.mode === "side" || !plan.forward) return;
    const si = colIndex.get(rankOf.get(plan.e.from)!)!;
    if (si + 1 >= ranks.length) return;
    (byCol.get(si) ?? (byCol.set(si, []), byCol.get(si)!)).push(i);
  });
  for (const [si, idxs] of byCol) {
    const start = bandStart.get(ranks[si])! + bandExtent.get(ranks[si])!;
    const end = bandStart.get(ranks[si + 1])!;
    idxs.sort((a, b) => plans[a].src.cross - plans[b].src.cross);
    const n = idxs.length;
    idxs.forEach((idx, k) => {
      plans[idx].trunk = start + ((end - start) * (k + 1)) / (n + 1);
    });
  }

  // For cross-lane edges sharing a target/side: spread the lane-gap channel, and
  // fan the source/target cross-face ports across each node's width so stacked
  // sources don't drop on the same vertical.
  const byTarget = new Map<string, number[]>();
  plans.forEach((plan, i) => {
    if (plan.mode === "same" || plan.mode === "side") return;
    const key = `${plan.e.to}|${plan.targetAbove ? "A" : "B"}`;
    (byTarget.get(key) ?? (byTarget.set(key, []), byTarget.get(key)!)).push(i);
  });
  // Port positions come from the face loop (which distributes all ports on a
  // face jointly); here we only spread the lane-gap channel depth so same-target
  // horizontals stay distinct.
  for (const idxs of byTarget.values()) {
    idxs.sort((a, b) => geom(plans[a].e.from).crossCenter - geom(plans[b].e.from).crossCenter);
    const n = idxs.length;
    idxs.forEach((idx, k) => {
      plans[idx].channelCross += (k - (n - 1) / 2) * CHANNEL_SPACING;
    });
  }

  // Build polylines.
  return plans.map((plan) => {
    const s = toXY(plan.src.flow, plan.src.cross, horizontal);
    const d = toXY(plan.dst.flow, plan.dst.cross, horizontal);
    let points: LayoutPoint[];
    if (plan.mode === "side") {
      // Dense hub and reciprocal routes prefer a direct diagonal between
      // distributed ports. That avoids building bundles of parallel red lines.
      points = simplifyPolyline([s, d]);
    } else if (plan.mode === "same") {
      // H-V-H: source flow face -> trunk -> target flow face.
      points = simplifyPolyline([s, toXY(plan.trunk, plan.src.cross, horizontal), toXY(plan.trunk, plan.dst.cross, horizontal), d]);
    } else if (plan.mode === "direct") {
      // V-H-V: drop/rise from the source face, cross the single lane gap, into target.
      points = simplifyPolyline([s, toXY(plan.src.flow, plan.channelCross, horizontal), toXY(plan.dst.flow, plan.channelCross, horizontal), d]);
    } else {
      // H-V-H-V: into a column-gap trunk, across the lane gap, into target top/bottom.
      points = simplifyPolyline([s, toXY(plan.trunk, plan.src.cross, horizontal), toXY(plan.trunk, plan.channelCross, horizontal), toXY(plan.dst.flow, plan.channelCross, horizontal), d]);
    }
    // Offset the label off the line (above for H, to the right for V) so a
    // short segment isn't hidden under the label's background.
    const seg = longestSegment(points);
    const labelAt = seg.orient === "h" ? { x: seg.x, y: seg.y - 11 } : { x: seg.x + 8, y: seg.y };
    return { id: plan.e.id, from: plan.e.from, to: plan.e.to, label: plan.e.label, points, labelAt, labelOrient: seg.orient };
  });
}
