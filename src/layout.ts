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
const CHAR_W = 8;
const NODE_PAD_X = 28;
const RANK_GAP = 110; // gap between bands along the flow axis
const NODE_GAP = 28; // gap between nodes within a band
const LANE_GAP = 64; // gap between zone lanes on the cross axis (clears zone boxes)
const MARGIN = 40;
const ZONE_PAD = 22;

function nodeWidth(label: string): number {
  return Math.max(NODE_MIN_W, Math.min(NODE_MAX_W, label.length * CHAR_W + NODE_PAD_X * 2));
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

  // --- Positions ------------------------------------------------------------
  // Cross axis size per band (width for LR, height for TD).
  const laid = new Map<string, LayoutNode>();
  // Per-rank extent along the flow axis = max node size on that axis.
  const bandExtent = new Map<number, number>();
  for (const r of ranks) {
    let ext = 0;
    for (const n of byRank.get(r)!) {
      const w = nodeWidth(n.label);
      ext = Math.max(ext, horizontal ? w : NODE_H);
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
  const crossSizeOf = (n: { label: string }) => (horizontal ? NODE_H : nodeWidth(n.label));
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
      const w = nodeWidth(n.label);
      const h = NODE_H;
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
    const minY = Math.min(...members.map((m) => m.y)) - ZONE_PAD;
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
    const minY = Math.min(...members.map((m) => m.y)) - ZONE_PAD;
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
  const edges = routeEdges(validEdges, laid, rank, ranks, bandStart, bandExtent, horizontal);

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

/**
 * Orthogonal edge routing with distributed ports and channels.
 *
 * - Ports: edges touching the same node face are spread along that face instead
 *   of all meeting at its center, so parallel runs don't overlap. Port order
 *   follows the other endpoint's position to reduce crossings.
 * - Channels: each forward edge's vertical run gets a distinct lane within the
 *   gap after its source column, so verticals don't coincide.
 * - Labels sit on the longest segment, which (thanks to distinct ports) lands
 *   at distinct positions and no longer piles up.
 */
function routeEdges(
  list: { id: string; from: string; to: string; label?: string }[],
  laid: Map<string, LayoutNode>,
  rankOf: Map<string, number>,
  ranks: number[],
  bandStart: Map<number, number>,
  bandExtent: Map<number, number>,
  horizontal: boolean,
): LayoutEdge[] {
  const colIndex = new Map(ranks.map((r, i) => [r, i]));
  const FACE_INSET = 6;

  // Geometry of a node along the flow/cross axes.
  const geom = (id: string) => {
    const n = laid.get(id)!;
    const flowLow = horizontal ? n.x : n.y;
    const flowSize = horizontal ? n.w : n.h;
    const crossLow = horizontal ? n.y : n.x;
    const crossSize = horizontal ? n.h : n.w;
    return { flowLow, flowHigh: flowLow + flowSize, crossLow, crossSize, crossCenter: crossLow + crossSize / 2, flowCenter: flowLow + flowSize / 2 };
  };

  // Per-edge endpoint plan.
  interface Plan {
    e: { id: string; from: string; to: string; label?: string };
    forward: boolean;
    srcFaceFlow: number;
    dstFaceFlow: number;
    srcCross: number; // assigned later
    dstCross: number; // assigned later
    channel: number; // assigned later
  }
  const plans: Plan[] = [];

  // face buckets: key = `${nodeId}|${"L"|"H"}` -> entries to sort & distribute.
  interface PortEntry { planIndex: number; isSource: boolean; sortKey: number }
  const faces = new Map<string, PortEntry[]>();
  const faceKey = (node: string, high: boolean) => `${node}|${high ? "H" : "L"}`;

  for (const e of list) {
    const a = geom(e.from);
    const b = geom(e.to);
    const forward = b.flowCenter >= a.flowCenter;
    const srcHigh = forward; // source exits the high face when target is ahead
    const dstHigh = !forward;
    const plan: Plan = {
      e,
      forward,
      srcFaceFlow: srcHigh ? a.flowHigh : a.flowLow,
      dstFaceFlow: dstHigh ? b.flowHigh : b.flowLow,
      srcCross: a.crossCenter,
      dstCross: b.crossCenter,
      channel: (forward ? a.flowHigh + b.flowLow : a.flowLow + b.flowHigh) / 2,
    };
    const i = plans.push(plan) - 1;
    (faces.get(faceKey(e.from, srcHigh)) ?? faces.set(faceKey(e.from, srcHigh), []).get(faceKey(e.from, srcHigh))!).push({ planIndex: i, isSource: true, sortKey: b.crossCenter });
    (faces.get(faceKey(e.to, dstHigh)) ?? faces.set(faceKey(e.to, dstHigh), []).get(faceKey(e.to, dstHigh))!).push({ planIndex: i, isSource: false, sortKey: a.crossCenter });
  }

  // Distribute ports along each face.
  for (const [key, entries] of faces) {
    const nodeId = key.slice(0, key.lastIndexOf("|"));
    const g = geom(nodeId);
    entries.sort((p, q) => p.sortKey - q.sortKey);
    const span = g.crossSize - FACE_INSET * 2;
    const n = entries.length;
    entries.forEach((entry, i) => {
      const cross = g.crossLow + FACE_INSET + (n === 1 ? span / 2 : (span * i) / (n - 1));
      if (entry.isSource) plans[entry.planIndex].srcCross = cross;
      else plans[entry.planIndex].dstCross = cross;
    });
  }

  // Distribute channels: forward edges grouped by source column.
  const byChannelGroup = new Map<number, number[]>();
  plans.forEach((plan, i) => {
    if (!plan.forward) return;
    const si = colIndex.get(rankOf.get(plan.e.from)!)!;
    if (si + 1 >= ranks.length) return; // no gap after; keep midpoint channel
    (byChannelGroup.get(si) ?? byChannelGroup.set(si, []).get(si)!).push(i);
  });
  for (const [si, idxs] of byChannelGroup) {
    const start = bandStart.get(ranks[si])! + bandExtent.get(ranks[si])!;
    const end = bandStart.get(ranks[si + 1])!;
    idxs.sort((a, b) => plans[a].srcCross - plans[b].srcCross);
    const n = idxs.length;
    idxs.forEach((idx, k) => {
      plans[idx].channel = start + ((end - start) * (k + 1)) / (n + 1);
    });
  }

  // Build polylines.
  return plans.map((plan) => {
    const a = toXY(plan.srcFaceFlow, plan.srcCross, horizontal);
    const b = toXY(plan.dstFaceFlow, plan.dstCross, horizontal);
    let points: LayoutPoint[];
    if (Math.abs(plan.srcCross - plan.dstCross) < 0.5) {
      points = [a, b];
    } else {
      points = [a, toXY(plan.channel, plan.srcCross, horizontal), toXY(plan.channel, plan.dstCross, horizontal), b];
    }
    // Offset the label off the line (above for H, to the right for V) so a
    // short segment isn't hidden under the label's background.
    const seg = longestSegment(points);
    const labelAt = seg.orient === "h" ? { x: seg.x, y: seg.y - 11 } : { x: seg.x + 8, y: seg.y };
    return { id: plan.e.id, from: plan.e.from, to: plan.e.to, label: plan.e.label, points, labelAt, labelOrient: seg.orient };
  });
}
