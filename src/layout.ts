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

import type { ArchMapModel, ArchNode, Direction, NodeShape } from "./types.js";

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
  parent?: string;
  kind?: string;
  depth?: number;
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
  /** How to assign the secondary swimlane axis. */
  laneBy?: "zone" | "layer";
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

const ANDROID_LAYER_ORDER = [
  "applications",
  "application_framework",
  "libraries",
  "linux_kernel",
  "baseband",
];

const ANDROID_LAYER_INDEX = new Map(ANDROID_LAYER_ORDER.map((l, i) => [l, i]));

// Geometry constants.
const NODE_H = 48;
const NODE_MIN_W = 96;
const NODE_MAX_W = 260;
const HUB_NODE_MAX_W = 420;
const HUB_NODE_MAX_H = 128;
const CHAR_W = 8;
const NODE_PAD_X = 28;
const RANK_GAP = 170; // gap between bands along the flow axis
const NODE_GAP = 72; // gap between nodes within a band
const LANE_GAP = 128; // gap between zone lanes on the cross axis (clears zone boxes)
const LAYER_LANE_GAP = 28;
const LAYER_LANE_EXTENT = 116;
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

function androidStackLayer(node: Pick<ArchNode, "androidComponent" | "androidLayer" | "provider" | "layer">): string | undefined {
  const androidLayer = node.androidLayer;
  if (node.androidComponent === "application" || node.androidComponent === "activity") return "applications";
  if (androidLayer === "framework_api" || androidLayer === "framework_service" || androidLayer === "system_service" || androidLayer === "ipc") {
    return "application_framework";
  }
  if (androidLayer === "hal" || androidLayer === "native_library" || androidLayer === "vendor_library") return "libraries";
  if (androidLayer === "kernel_driver" || node.provider === "linux") return "linux_kernel";
  if (androidLayer === "hardware" || androidLayer === "hardware_controller" || node.provider === "device") return "baseband";
  if (node.provider === "android" && node.layer === "client") return "applications";
  return undefined;
}

function layerLaneKey(node: Pick<ArchNode, "androidComponent" | "androidLayer" | "provider" | "layer">): string {
  return androidStackLayer(node) ?? node.layer ?? "";
}

function buildLayerRank(nodes: ArchNode[]): (layer: string | undefined) => number {
  const hasAndroidStack = nodes.some((n) => !!androidStackLayer(n));
  const known = hasAndroidStack ? ANDROID_LAYER_INDEX : LAYER_INDEX;
  let next = known.size;
  const custom = new Map<string, number>();
  for (const node of nodes) {
    const layer = layerLaneKey(node);
    if (!layer || known.has(layer) || custom.has(layer)) continue;
    custom.set(layer, next++);
  }
  return (layer) => {
    if (!layer) return next;
    return known.get(layer) ?? custom.get(layer) ?? next;
  };
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
  const laneBy = options.laneBy ?? "zone";

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
  const layerRankFor = buildLayerRank(model.nodes);
  const laneKey = (n: ArchNode) => laneBy === "layer" ? layerLaneKey(n) : n.zone ?? "";
  const seen: string[] = [];
  for (const n of model.nodes) {
    const k = laneKey(n);
    if (!seen.includes(k)) seen.push(k);
  }
  const zoneRankFor = buildZoneRank(model.nodes.map((n) => n.zone));
  const laneOrder = [...seen].sort((a, b) => {
    const ra = a === "" ? Number.MAX_SAFE_INTEGER : laneBy === "layer" ? layerRankFor(a) : zoneRankFor(a);
    const rb = b === "" ? Number.MAX_SAFE_INTEGER : laneBy === "layer" ? layerRankFor(b) : zoneRankFor(b);
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
    if (laneBy === "layer" && horizontal) {
      const sums = new Map<string, number>();
      for (const n of byRank.get(r)!) {
        const size = sizeById.get(n.id)!;
        const lane = laneKey(n);
        sums.set(lane, (sums.get(lane) ?? 0) + size.w + NODE_GAP);
      }
      ext = Math.max(...[...sums.values()].map((value) => value - NODE_GAP), NODE_MIN_W);
    } else {
      for (const n of byRank.get(r)!) {
        const size = sizeById.get(n.id)!;
        ext = Math.max(ext, horizontal ? size.w : size.h);
      }
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
  if (laneBy === "layer") {
    for (const lane of laneOrder) laneExtent.set(lane, LAYER_LANE_EXTENT);
  } else {
    for (const r of ranks) {
      const sums = new Map<string, number>();
      for (const n of byRank.get(r)!) {
        sums.set(laneKey(n), (sums.get(laneKey(n)) ?? 0) + crossSizeOf(n) + NODE_GAP);
      }
      for (const [lane, s] of sums) {
        laneExtent.set(lane, Math.max(laneExtent.get(lane) ?? 0, s - NODE_GAP));
      }
    }
  }
  // Cumulative cross-axis start per lane.
  const laneStart = new Map<string, number>();
  {
    let cursor = MARGIN;
    for (const lane of laneOrder) {
      laneStart.set(lane, cursor);
      cursor += (laneExtent.get(lane) ?? NODE_H) + (laneBy === "layer" ? LAYER_LANE_GAP : LANE_GAP);
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
      const cur = laneCursor.get(lane) ?? (laneBy === "layer" && horizontal ? flow : laneStart.get(lane)!);
      laneCursor.set(lane, cur + (laneBy === "layer" && horizontal ? w : cs) + NODE_GAP);
      let x: number, y: number;
      if (horizontal && laneBy === "layer") {
        x = cur;
        y = laneStart.get(lane)! + ((laneExtent.get(lane) ?? LAYER_LANE_EXTENT) - h) / 2;
      } else if (horizontal) {
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

  // --- Zones (bounding boxes of members, including nested child zones) -------
  const zoneById = new Map(model.zones.map((z) => [z.id, z]));
  const childrenByZone = new Map<string, string[]>();
  for (const z of model.zones) {
    if (z.parent && zoneById.has(z.parent)) {
      childrenByZone.set(z.parent, [...(childrenByZone.get(z.parent) ?? []), z.id]);
    }
    for (const child of z.resolvedContains ?? []) {
      if (child.type !== "zone") continue;
      childrenByZone.set(z.id, [...(childrenByZone.get(z.id) ?? []), child.id]);
    }
  }
  for (const [parent, children] of childrenByZone) {
    childrenByZone.set(parent, [...new Set(children)]);
  }

  const directZoneNodeIds = (zoneId: string): string[] => {
    const z = zoneById.get(zoneId);
    const explicit = (z?.resolvedContains ?? [])
      .filter((child) => child.type === "node")
      .map((child) => child.id);
    const fallback = (z?.contains ?? []).filter((id) => laid.has(id));
    return [...new Set([...explicit, ...fallback])];
  };

  const zonesById = new Map<string, LayoutZone>();
  const visitingZones = new Set<string>();
  const zoneDepth = (id: string, seen = new Set<string>()): number => {
    const z = zoneById.get(id);
    if (!z?.parent || !zoneById.has(z.parent) || seen.has(id)) return 0;
    seen.add(id);
    return zoneDepth(z.parent, seen) + 1;
  };
  const buildZoneBox = (id: string): LayoutZone | undefined => {
    if (zonesById.has(id)) return zonesById.get(id);
    if (visitingZones.has(id)) return undefined;
    const z = zoneById.get(id);
    if (!z) return undefined;
    visitingZones.add(id);

    const directNodes = directZoneNodeIds(id)
      .map((nodeId) => laid.get(nodeId))
      .filter((n): n is LayoutNode => !!n);
    const childZones = (childrenByZone.get(id) ?? [])
      .map((childId) => buildZoneBox(childId))
      .filter((box): box is LayoutZone => !!box);
    const boxes = [
      ...directNodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h, z: n.z, nodeIds: [n.id] })),
      ...childZones.map((box) => ({ x: box.x, y: box.y, w: box.w, h: box.h, z: box.z, nodeIds: box.nodeIds })),
    ];
    visitingZones.delete(id);
    if (boxes.length === 0) return undefined;

    const minX = Math.min(...boxes.map((m) => m.x)) - ZONE_PAD;
    const minY = Math.min(...boxes.map((m) => m.y)) - ZONE_LABEL_PAD;
    const maxX = Math.max(...boxes.map((m) => m.x + m.w)) + ZONE_PAD;
    const maxY = Math.max(...boxes.map((m) => m.y + m.h)) + ZONE_PAD;
    const nodeIds = [...new Set(boxes.flatMap((box) => box.nodeIds))];
    const box: LayoutZone = {
      id: z.id,
      label: z.label ?? z.id,
      parent: z.parent,
      kind: z.kind,
      depth: zoneDepth(z.id),
      x: minX,
      y: minY,
      z: Math.min(...boxes.map((m) => m.z)),
      w: maxX - minX,
      h: maxY - minY,
      nodeIds,
    };
    zonesById.set(id, box);
    return box;
  };
  for (const z of model.zones) buildZoneBox(z.id);
  const zones = [...zonesById.values()].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0) || a.id.localeCompare(b.id));

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
      else if (zonesById.has(c)) ids.push(...(zonesById.get(c)?.nodeIds ?? []));
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
  const allPoints = [
    ...[...laid.values()].flatMap((n) => [{ x: n.x, y: n.y }, { x: n.x + n.w, y: n.y + n.h }]),
    ...zones.flatMap((z) => [{ x: z.x, y: z.y }, { x: z.x + z.w, y: z.y + z.h }]),
    ...boundaries.flatMap((b) => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]),
    ...edges.flatMap((e) => [...e.points, e.labelAt]),
  ];
  const minX = Math.min(...allPoints.map((p) => p.x));
  const minY = Math.min(...allPoints.map((p) => p.y));
  const maxX = Math.max(width, ...allPoints.map((p) => p.x));
  const maxY = Math.max(height, ...allPoints.map((p) => p.y));
  const shiftX = minX < MARGIN ? MARGIN - minX : 0;
  const shiftY = minY < MARGIN ? MARGIN - minY : 0;
  if (shiftX || shiftY) {
    for (const n of laid.values()) {
      n.x += shiftX;
      n.y += shiftY;
    }
    for (const z of zones) {
      z.x += shiftX;
      z.y += shiftY;
    }
    for (const b of boundaries) {
      b.x += shiftX;
      b.y += shiftY;
    }
    for (const e of edges) {
      e.points = e.points.map((p) => ({ x: p.x + shiftX, y: p.y + shiftY }));
      e.labelAt = { x: e.labelAt.x + shiftX, y: e.labelAt.y + shiftY };
    }
  }
  const canvasWidth = Math.max(width + shiftX, maxX + shiftX + MARGIN);
  const canvasHeight = Math.max(height + shiftY, maxY + shiftY + MARGIN);

  return {
    direction,
    width: Math.max(canvasWidth, MARGIN * 2),
    height: Math.max(canvasHeight, MARGIN * 2),
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
type BoxFace = "left" | "right" | "top" | "bottom";

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

function boundaryPoint(node: LayoutNode, face: BoxFace, point: LayoutPoint): LayoutPoint {
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

/**
 * Orthogonal edge routing on a swimlane grid. Verticals run in column gaps and
 * horizontals run inside lanes or in lane gaps, so lines never cross node boxes.
 *
 * The default path is straight or one-bend orthogonal. Ports are distributed on
 * component faces, then projected from the bounding box to the actual rendered
 * shape boundary (ellipse, diamond, database cylinder, or rectangle).
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
  const boxFace = (face: Face): BoxFace => {
    if (horizontal) {
      if (face === "fL") return "left";
      if (face === "fH") return "right";
      if (face === "cL") return "top";
      return "bottom";
    }
    if (face === "fL") return "top";
    if (face === "fH") return "bottom";
    if (face === "cL") return "left";
    return "right";
  };
  const projectEnd = (end: End): void => {
    const node = laid.get(end.node)!;
    const p = boundaryPoint(node, boxFace(end.face), toXY(end.flow, end.cross, horizontal));
    end.flow = horizontal ? p.x : p.y;
    end.cross = horizontal ? p.y : p.x;
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
  const balancedHubFace = (node: string, preferred: Face, allowed: Face[] = ["fL", "fH", "cL", "cH"]): Face => {
    const g = geom(node);
    const maxCapacity = Math.max(g.flowSize, g.crossSize, 1);
    const faceCapacity = (face: Face): number => face === "fL" || face === "fH" ? g.crossSize : g.flowSize;
    const best = allowed
      .map((face) => {
        const capacityPenalty = maxCapacity / Math.max(faceCapacity(face), 1);
        return {
          face,
          score: (faceUse.get(`${node}|${face}`) ?? 0) * 4 * capacityPenalty + faceCost(face, preferred) + capacityPenalty * 0.25,
        };
      })
      .sort((a, b) => a.score - b.score || faceCost(a.face, preferred) - faceCost(b.face, preferred))[0].face;
    faceUse.set(`${node}|${best}`, (faceUse.get(`${node}|${best}`) ?? 0) + 1);
    return best;
  };
  const pairedTrackFace = (preferred: Face, ordinal: number): Face => {
    return ordinal % 2 === 0 ? preferred : preferred[0] === "f" ? (preferred === "fH" ? "cH" : "cL") : (preferred === "cH" ? "fH" : "fL");
  };
  const complementaryTargetFace = (srcFace: Face, source: ReturnType<typeof geom>, target: ReturnType<typeof geom>): Face => {
    if (srcFace === "fL" || srcFace === "fH") {
      const dc = target.crossCenter - source.crossCenter;
      if (Math.abs(dc) < 0.5) return target.flowCenter >= source.flowCenter ? "fL" : "fH";
      return dc >= 0 ? "cL" : "cH";
    }
    const df = target.flowCenter - source.flowCenter;
    if (Math.abs(df) < 0.5) return target.crossCenter >= source.crossCenter ? "cL" : "cH";
    return df >= 0 ? "fL" : "fH";
  };
  const oneBendSourceFaces = (source: ReturnType<typeof geom>, target: ReturnType<typeof geom>): Face[] => {
    const df = target.flowCenter - source.flowCenter;
    const dc = target.crossCenter - source.crossCenter;
    const flowFace: Face = df >= 0 ? "fH" : "fL";
    const crossFace: Face = dc >= 0 ? "cH" : "cL";
    if (Math.abs(dc) < 0.5) return [flowFace];
    if (Math.abs(df) < 0.5) return [crossFace];
    return Math.abs(df) >= Math.abs(dc) ? [flowFace, crossFace] : [crossFace, flowFace];
  };
  const faceMidpoint = (nodeId: string, face: Face): End => {
    const g = geom(nodeId);
    const end = {
      node: nodeId,
      face,
      flow: face === "fL" ? g.flowLow : face === "fH" ? g.flowHigh : g.flowCenter,
      cross: face === "cL" ? g.crossLow : face === "cH" ? g.crossHigh : g.crossCenter,
    };
    projectEnd(end);
    return end;
  };
  const facePoint = (nodeId: string, face: Face, along: number): End => {
    const g = geom(nodeId);
    const end = {
      node: nodeId,
      face,
      flow: face === "fL" ? g.flowLow : face === "fH" ? g.flowHigh : g.flowLow + g.flowSize * along,
      cross: face === "cL" ? g.crossLow : face === "cH" ? g.crossHigh : g.crossLow + g.crossSize * along,
    };
    projectEnd(end);
    return end;
  };
  const roughPoints = (src: End, dst: End): LayoutPoint[] => {
    const a = toXY(src.flow, src.cross, horizontal);
    const b = toXY(dst.flow, dst.cross, horizontal);
    if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) return [a, b];
    const sourceIsFlow = src.face === "fL" || src.face === "fH";
    return sourceIsFlow ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b];
  };
  const routeLength = (points: LayoutPoint[]): number =>
    points.reduce((sum, p, i) => {
      if (i === 0) return 0;
      const prev = points[i - 1];
      return sum + Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
    }, 0);
  const pointInsideShape = (node: LayoutNode, point: LayoutPoint, pad = 0.75): boolean => {
    const cx = node.x + node.w / 2;
    const cy = node.y + node.h / 2;
    const rx = node.w / 2;
    const ry = node.h / 2;
    if (node.shape === "circle") return ((point.x - cx) / rx) ** 2 + ((point.y - cy) / ry) ** 2 < 1 - pad / Math.max(rx, ry);
    if (node.shape === "diamond") return Math.abs(point.x - cx) / rx + Math.abs(point.y - cy) / ry < 1 - pad / Math.max(rx, ry);
    if (node.shape === "database") {
      const capRy = Math.min(10, node.h / 6);
      const topCy = node.y + capRy;
      const bottomCy = node.y + node.h - capRy;
      const inBody = point.x > node.x + pad && point.x < node.x + node.w - pad && point.y >= topCy && point.y <= bottomCy;
      const inTop = ((point.x - cx) / rx) ** 2 + ((point.y - topCy) / capRy) ** 2 < 1 - pad / Math.max(rx, capRy);
      const inBottom = ((point.x - cx) / rx) ** 2 + ((point.y - bottomCy) / capRy) ** 2 < 1 - pad / Math.max(rx, capRy);
      return inBody || inTop || inBottom;
    }
    return point.x > node.x + pad && point.x < node.x + node.w - pad && point.y > node.y + pad && point.y < node.y + node.h - pad;
  };
  const routeNodeHits = (points: LayoutPoint[], from: string, to: string): number => {
    let hits = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const len = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      const steps = Math.max(2, Math.ceil(len / 6));
      for (let step = 1; step < steps; step++) {
        const t = step / steps;
        const sample = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        for (const node of laid.values()) {
          if (node.id === from || node.id === to) continue;
          if (pointInsideShape(node, sample)) hits++;
        }
      }
    }
    return hits;
  };
  const routeBorderCoincidence = (points: LayoutPoint[], from: string, to: string): number => {
    let hits = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const horizontalSeg = Math.abs(a.y - b.y) < 0.5;
      const verticalSeg = Math.abs(a.x - b.x) < 0.5;
      if (!horizontalSeg && !verticalSeg) continue;
      for (const node of laid.values()) {
        if (node.id === from || node.id === to) continue;
        if (horizontalSeg) {
          const x0 = Math.min(a.x, b.x);
          const x1 = Math.max(a.x, b.x);
          const overlap = Math.min(x1, node.x + node.w) - Math.max(x0, node.x);
          if (overlap > 1 && (Math.abs(a.y - node.y) < 0.5 || Math.abs(a.y - (node.y + node.h)) < 0.5)) hits++;
        }
        if (verticalSeg) {
          const y0 = Math.min(a.y, b.y);
          const y1 = Math.max(a.y, b.y);
          const overlap = Math.min(y1, node.y + node.h) - Math.max(y0, node.y);
          if (overlap > 1 && (Math.abs(a.x - node.x) < 0.5 || Math.abs(a.x - (node.x + node.w)) < 0.5)) hits++;
        }
      }
    }
    return hits;
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
    const hubEdge = isHub(e.from) || isHub(e.to);
    let mode: Mode = hubEdge || multiEdgePair ? "side" : la === lb ? "same" : Math.abs(la - lb) === 1 ? "direct" : "trunk";
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
    {
      const allowedSrcFaces = [...oneBendSourceFaces(a, b), "fL", "fH", "cL", "cH"].filter((face, index, list): face is Face => list.indexOf(face) === index);
      const ordinal = pairOrdinals.get(e.id) ?? 0;
      const preferred = multiEdgePair ? pairedTrackFace(allowedSrcFaces[0], ordinal) : allowedSrcFaces[0];
      const rankedFaces = allowedSrcFaces
        .map((face) => {
          const dst = complementaryTargetFace(face, a, b);
          const route = roughPoints(faceMidpoint(e.from, face), faceMidpoint(e.to, dst));
          const hits = routeNodeHits(route, e.from, e.to);
          return { face, hits, length: routeLength(route), cost: faceCost(face, preferred) };
        })
        .sort((left, right) => left.hits - right.hits || left.length - right.length || left.cost - right.cost);
      const preferredNoHit = rankedFaces[0]?.face ?? allowedSrcFaces[0];
      srcFace = isHub(e.from)
        ? balancedHubFace(e.from, preferredNoHit, rankedFaces.filter((item) => item.hits === rankedFaces[0].hits).map((item) => item.face))
        : preferredNoHit;
      dstFace = complementaryTargetFace(srcFace, a, b);
      channelCross = srcFace === "fL" || srcFace === "fH"
        ? (targetAbove ? b.crossHigh + CHANNEL_INSET : b.crossLow - CHANNEL_INSET)
        : (forward ? b.flowLow - CHANNEL_INSET : b.flowHigh + CHANNEL_INSET);
    }

    const plan: Plan = {
      e, mode,
      forward, targetAbove,
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
    const min = low + FACE_INSET;
    const max = low + FACE_INSET + span;
    const clampPos = (value: number): number => Math.min(max, Math.max(min, value));
    let positions = entries.map((entry) => clampPos(entry.sortKey));
    if (n > 1) {
      const minSep = Math.min(18, span / Math.max(1, n - 1));
      for (let i = 1; i < positions.length; i++) {
        positions[i] = Math.max(positions[i], positions[i - 1] + minSep);
      }
      const overflow = positions[positions.length - 1] - max;
      if (overflow > 0) positions = positions.map((pos) => pos - overflow);
      for (let i = positions.length - 2; i >= 0; i--) {
        positions[i] = Math.min(positions[i], positions[i + 1] - minSep);
      }
      const underflow = min - positions[0];
      if (underflow > 0) positions = positions.map((pos) => pos + underflow);
      if (positions[0] < min - 0.5 || positions[positions.length - 1] > max + 0.5) {
        positions = entries.map((_, i) => min + (span * i) / (n - 1));
      }
    }
    entries.forEach((entry, i) => {
      const pos = n === 1 ? clampPos(entry.sortKey) : positions[i];
      const end = entry.isSource ? plans[entry.planIndex].src : plans[entry.planIndex].dst;
      if (varyFlow) { end.flow = pos; end.cross = fixed; }
      else { end.cross = pos; end.flow = fixed; }
    });
  }
  const isFlowFace = (face: Face): boolean => face === "fL" || face === "fH";
  const redistributeNodeAxisPorts = (node: string, axisFaces: Face[], varyFlow: boolean): void => {
    const g = geom(node);
    const entries = axisFaces.flatMap((face) => (faces.get(`${node}|${face}`) ?? []).map((entry) => ({ ...entry, face })));
    if (entries.length <= 1) return;
    const low = varyFlow ? g.flowLow : g.crossLow;
    const size = varyFlow ? g.flowSize : g.crossSize;
    const span = size - FACE_INSET * 2;
    const min = low + FACE_INSET;
    const max = low + FACE_INSET + span;
    const fixedFor = (face: Face): number =>
      face === "fL" ? g.flowLow : face === "fH" ? g.flowHigh : face === "cL" ? g.crossLow : g.crossHigh;
    entries.sort((p, q) => p.sortKey - q.sortKey || p.face.localeCompare(q.face));
    const n = entries.length;
    const minSep = Math.min(16, span / Math.max(1, n - 1));
    let positions = entries.map((entry) => Math.min(max, Math.max(min, entry.sortKey)));
    for (let i = 1; i < positions.length; i++) positions[i] = Math.max(positions[i], positions[i - 1] + minSep);
    const overflow = positions[positions.length - 1] - max;
    if (overflow > 0) positions = positions.map((pos) => pos - overflow);
    for (let i = positions.length - 2; i >= 0; i--) positions[i] = Math.min(positions[i], positions[i + 1] - minSep);
    const underflow = min - positions[0];
    if (underflow > 0) positions = positions.map((pos) => pos + underflow);
    if (positions[0] < min - 0.5 || positions[positions.length - 1] > max + 0.5) {
      positions = entries.map((_, i) => min + (span * i) / Math.max(1, n - 1));
    }
    entries.forEach((entry, i) => {
      const end = entry.isSource ? plans[entry.planIndex].src : plans[entry.planIndex].dst;
      const fixed = fixedFor(entry.face);
      if (varyFlow) { end.flow = positions[i]; end.cross = fixed; }
      else { end.cross = positions[i]; end.flow = fixed; }
    });
  };
  for (const node of laid.keys()) {
    redistributeNodeAxisPorts(node, ["fL", "fH"], false);
    redistributeNodeAxisPorts(node, ["cL", "cH"], true);
  }
  for (const plan of plans) {
    projectEnd(plan.src);
    projectEnd(plan.dst);
  }
  const deconflictEndpointCoordinates = (): void => {
    type EndpointEntry = { key: string; edgeId: string; end: End; value: number; variable: "flow" | "cross"; min: number; max: number };
    const entries: EndpointEntry[] = [];
    plans.forEach((plan, planIndex) => {
      [plan.src, plan.dst].forEach((end, endIndex) => {
        const g = geom(end.node);
        const variable: "flow" | "cross" = isFlowFace(end.face) ? "cross" : "flow";
        const low = variable === "flow" ? g.flowLow : g.crossLow;
        const size = variable === "flow" ? g.flowSize : g.crossSize;
        entries.push({
          key: `${planIndex}:${endIndex}:${plan.e.id}`,
          edgeId: plan.e.id,
          end,
          value: variable === "flow" ? end.flow : end.cross,
          variable,
          min: low + FACE_INSET,
          max: low + size - FACE_INSET,
        });
      });
    });
    for (let pass = 0; pass < 4; pass++) {
      const groups = new Map<string, EndpointEntry[]>();
      for (const entry of entries) {
        entry.value = entry.variable === "flow" ? entry.end.flow : entry.end.cross;
        const screenValue = horizontal
          ? (entry.variable === "flow" ? entry.value : entry.value)
          : entry.value;
        const key = `${entry.variable}|${Math.round(screenValue * 2) / 2}`;
        (groups.get(key) ?? (groups.set(key, []), groups.get(key)!)).push(entry);
      }
      let changed = false;
      for (const group of groups.values()) {
        if (group.length <= 1) continue;
        if (new Set(group.map((entry) => entry.edgeId)).size <= 1) continue;
        group.sort((a, b) => a.key.localeCompare(b.key));
        const mid = (group.length - 1) / 2;
        group.forEach((entry, i) => {
          const span = Math.max(1, entry.max - entry.min);
          const step = Math.min(10, span / Math.max(1, group.length - 1));
          const next = Math.min(entry.max, Math.max(entry.min, entry.value + (i - mid) * step));
          if (Math.abs(next - entry.value) > 0.5) {
            if (entry.variable === "flow") entry.end.flow = next;
            else entry.end.cross = next;
            projectEnd(entry.end);
            changed = true;
          }
        });
      }
      if (!changed) break;
    }
  };
  deconflictEndpointCoordinates();

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

  const endpointRecords = plans.flatMap((plan) => [
    { edgeId: plan.e.id, flow: plan.src.flow, cross: plan.src.cross },
    { edgeId: plan.e.id, flow: plan.dst.flow, cross: plan.dst.cross },
  ]);
  const coordConflict = (edgeId: string, points: LayoutPoint[]): number => {
    let score = 0;
    const middle = points.slice(1, -1);
    for (const p of middle) {
      const flow = horizontal ? p.x : p.y;
      const cross = horizontal ? p.y : p.x;
      for (const endpoint of endpointRecords) {
        if (endpoint.edgeId === edgeId) continue;
        if (Math.abs(flow - endpoint.flow) < 0.5) score += 1;
        if (Math.abs(cross - endpoint.cross) < 0.5) score += 1;
      }
    }
    return score;
  };
  const pointConflictsEndpoint = (edgeId: string, point: LayoutPoint): boolean => {
    const flow = horizontal ? point.x : point.y;
    const cross = horizontal ? point.y : point.x;
    return endpointRecords.some((endpoint) =>
      endpoint.edgeId !== edgeId &&
      (Math.abs(flow - endpoint.flow) < 0.5 || Math.abs(cross - endpoint.cross) < 0.5),
    );
  };
  const deconflictBends = (edgeId: string, from: string, to: string, points: LayoutPoint[]): LayoutPoint[] => {
    let out = points;
    const offsets = [12, -12, 24, -24, 36, -36, 48, -48];
    for (let i = 1; i < out.length - 1; i++) {
      const prev = out[i - 1];
      const p = out[i];
      const next = out[i + 1];
      if (!pointConflictsEndpoint(edgeId, p)) continue;
      const prevV = Math.abs(prev.x - p.x) < 0.5;
      const prevH = Math.abs(prev.y - p.y) < 0.5;
      const nextV = Math.abs(next.x - p.x) < 0.5;
      const nextH = Math.abs(next.y - p.y) < 0.5;
      const candidates: LayoutPoint[][] = [];
      if (prevV && nextH) {
        for (const offset of offsets) {
          const y = p.y + offset;
          candidates.push([...out.slice(0, i), { x: p.x, y }, { x: next.x, y }, ...out.slice(i + 1)]);
        }
      } else if (prevH && nextV) {
        for (const offset of offsets) {
          const x = p.x + offset;
          candidates.push([...out.slice(0, i), { x, y: p.y }, { x, y: next.y }, ...out.slice(i + 1)]);
        }
      }
      const replacement = candidates
        .filter((candidate) => candidate.slice(1, -1).every((point) => !pointConflictsEndpoint(edgeId, point)))
        .sort((a, b) => routeNodeHits(a, from, to) - routeNodeHits(b, from, to) || routeLength(a) - routeLength(b))[0];
      if (replacement && routeNodeHits(replacement, from, to) === 0) out = simplifyPolyline(replacement);
    }
    return out;
  };
  const candidateMidValues = (a: number, b: number, used: number[]): number[] => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const span = Math.max(hi - lo, 48);
    const base = (a + b) / 2;
    const values = [base, base - 24, base + 24, lo - 36, hi + 36, lo - 72, hi + 72];
    return values.sort((left, right) => {
      const lc = used.some((v) => Math.abs(left - v) < 0.5) ? 1 : 0;
      const rc = used.some((v) => Math.abs(right - v) < 0.5) ? 1 : 0;
      return lc - rc || Math.abs(left - base) - Math.abs(right - base) || Math.abs(left - (lo - span)) - Math.abs(right - (lo - span));
    });
  };
  const minimalPolyline = (plan: Plan): LayoutPoint[] => {
    const { src, dst } = plan;
    const s = toXY(src.flow, src.cross, horizontal);
    const d = toXY(dst.flow, dst.cross, horizontal);
    const sourceFlow = isFlowFace(src.face);
    const targetFlow = isFlowFace(dst.face);
    const endpointFlows = endpointRecords.filter((r) => r.edgeId !== plan.e.id).map((r) => r.flow);
    const endpointCrosses = endpointRecords.filter((r) => r.edgeId !== plan.e.id).map((r) => r.cross);

    const fromFC = (points: Array<{ flow: number; cross: number }>) =>
      simplifyPolyline(points.map((p) => toXY(p.flow, p.cross, horizontal)));
    const candidates: LayoutPoint[][] = [];
    if (Math.abs(src.flow - dst.flow) < 0.5 && !sourceFlow && !targetFlow) {
      candidates.push(fromFC([src, dst]));
    } else if (Math.abs(src.cross - dst.cross) < 0.5 && sourceFlow && targetFlow) {
      candidates.push(fromFC([src, dst]));
    }
    if (sourceFlow !== targetFlow) {
      const corner = sourceFlow
        ? { flow: dst.flow, cross: src.cross }
        : { flow: src.flow, cross: dst.cross };
      candidates.push(fromFC([src, corner, dst]));
      const midFlows = candidateMidValues(src.flow, dst.flow, endpointFlows).slice(0, 3);
      const midCrosses = candidateMidValues(src.cross, dst.cross, endpointCrosses).slice(0, 3);
      for (const midFlow of midFlows) {
        for (const midCross of midCrosses) {
          candidates.push(sourceFlow
            ? fromFC([src, { flow: midFlow, cross: src.cross }, { flow: midFlow, cross: midCross }, { flow: dst.flow, cross: midCross }, dst])
            : fromFC([src, { flow: src.flow, cross: midCross }, { flow: midFlow, cross: midCross }, { flow: midFlow, cross: dst.cross }, dst]));
        }
      }
    } else if (sourceFlow) {
      for (const midFlow of candidateMidValues(src.flow, dst.flow, endpointFlows).slice(0, 5)) {
        candidates.push(fromFC([src, { flow: midFlow, cross: src.cross }, { flow: midFlow, cross: dst.cross }, dst]));
      }
    } else {
      for (const midCross of candidateMidValues(src.cross, dst.cross, endpointCrosses).slice(0, 5)) {
        candidates.push(fromFC([src, { flow: src.flow, cross: midCross }, { flow: dst.flow, cross: midCross }, dst]));
      }
    }

    return candidates
      .sort((a, b) =>
        coordConflict(plan.e.id, a) - coordConflict(plan.e.id, b) ||
        routeNodeHits(a, plan.e.from, plan.e.to) - routeNodeHits(b, plan.e.from, plan.e.to) ||
        routeLength(a) - routeLength(b) ||
        a.length - b.length,
      )[0] ?? simplifyPolyline([s, d]);
  };
  const graphBounds = [...laid.values()].reduce(
    (acc, node) => ({
      x0: Math.min(acc.x0, node.x),
      x1: Math.max(acc.x1, node.x + node.w),
      y0: Math.min(acc.y0, node.y),
      y1: Math.max(acc.y1, node.y + node.h),
    }),
    { x0: Number.POSITIVE_INFINITY, x1: Number.NEGATIVE_INFINITY, y0: Number.POSITIVE_INFINITY, y1: Number.NEGATIVE_INFINITY },
  );
  const outsidePolyline = (src: End, dst: End): LayoutPoint[] => {
    const s = toXY(src.flow, src.cross, horizontal);
    const d = toXY(dst.flow, dst.cross, horizontal);
    const sourceIsFlow = src.face === "fL" || src.face === "fH";
    const targetIsFlow = dst.face === "fL" || dst.face === "fH";
    const outsideX = src.face === "fL" || dst.face === "fL" ? graphBounds.x0 - 48 : graphBounds.x1 + 48;
    const outsideY = src.face === "cL" || dst.face === "cL" ? graphBounds.y0 - 48 : graphBounds.y1 + 48;
    if (sourceIsFlow && targetIsFlow) return simplifyPolyline([s, { x: outsideX, y: s.y }, { x: outsideX, y: d.y }, d]);
    if (sourceIsFlow && !targetIsFlow) return simplifyPolyline([s, { x: outsideX, y: s.y }, { x: outsideX, y: outsideY }, { x: d.x, y: outsideY }, d]);
    if (!sourceIsFlow && targetIsFlow) return simplifyPolyline([s, { x: s.x, y: outsideY }, { x: outsideX, y: outsideY }, { x: outsideX, y: d.y }, d]);
    return simplifyPolyline([s, { x: s.x, y: outsideY }, { x: d.x, y: outsideY }, d]);
  };

  // Build polylines. The default route is at most one bend (3 points); more
  // complex tracks are reserved for a future explicit router mode.
  const routedPlans = plans.map((plan) => {
    const minimal = minimalPolyline(plan);
    const points = routeNodeHits(minimal, plan.e.from, plan.e.to) > 0
      ? [
          {
            route: outsidePolyline(plan.src, plan.dst),
            hits: routeNodeHits(outsidePolyline(plan.src, plan.dst), plan.e.from, plan.e.to),
            len: routeLength(outsidePolyline(plan.src, plan.dst)),
            targetFace: plan.dst.face,
            cost: 0,
          },
          ...(["fL", "fH", "cL", "cH"] as Face[])
          .flatMap((sourceFace) =>
            (["fL", "fH", "cL", "cH"] as Face[]).flatMap((targetFace) =>
              [0.08, 0.25, 0.5, 0.75, 0.92].flatMap((sourceAlong) =>
                [0.08, 0.25, 0.5, 0.75, 0.92].map((targetAlong) => {
                  const src = facePoint(plan.e.from, sourceFace, sourceAlong);
                  const dst = facePoint(plan.e.to, targetFace, targetAlong);
                  const route = outsidePolyline(src, dst);
                  const preferredTarget = complementaryTargetFace(sourceFace, geom(plan.e.from), geom(plan.e.to));
                  return {
                    route,
                    hits: routeNodeHits(route, plan.e.from, plan.e.to),
                    len: routeLength(route),
                    targetFace,
                    cost:
                      faceCost(sourceFace, plan.src.face) +
                      faceCost(targetFace, preferredTarget) +
                      Math.abs(sourceAlong - 0.5) +
                      Math.abs(targetAlong - 0.5),
                  };
                }),
              ),
            ),
          ),
        ]
          .sort((a, b) => {
            const targetBias = (face: Face): number => face === "cH" ? 0 : face === "fH" ? 1 : face === "fL" ? 2 : 3;
            return a.hits - b.hits ||
              routeBorderCoincidence(a.route, plan.e.from, plan.e.to) - routeBorderCoincidence(b.route, plan.e.from, plan.e.to) ||
              coordConflict(plan.e.id, a.route) - coordConflict(plan.e.id, b.route) ||
              a.len - b.len ||
              a.cost - b.cost ||
              targetBias(a.targetFace) - targetBias(b.targetFace);
          })[0].route
      : minimal;
    const routed = deconflictBends(plan.e.id, plan.e.from, plan.e.to, points);
    // Offset the label off the line (above for H, to the right for V) so a
    // short segment isn't hidden under the label's background.
    const seg = longestSegment(routed);
    const labelAt = seg.orient === "h" ? { x: seg.x, y: seg.y - 11 } : { x: seg.x + 8, y: seg.y };
    return { plan, edge: { id: plan.e.id, from: plan.e.from, to: plan.e.to, label: plan.e.label, points: routed, labelAt, labelOrient: seg.orient } };
  });
  const inferFaceFromPoint = (nodeId: string, point: LayoutPoint, adjacent: LayoutPoint): Face => {
    const node = laid.get(nodeId)!;
    const dx = adjacent.x - point.x;
    const dy = adjacent.y - point.y;
    if (horizontal) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 0.5) return dx < 0 ? "fL" : "fH";
      if (Math.abs(dy) > 0.5) return dy < 0 ? "cL" : "cH";
    } else {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 0.5) return dy < 0 ? "fL" : "fH";
      if (Math.abs(dx) > 0.5) return dx < 0 ? "cL" : "cH";
    }
    const distanceToFace = (face: Face): number => {
      const screenFace = boxFace(face);
      if (screenFace === "left") return Math.abs(point.x - node.x);
      if (screenFace === "right") return Math.abs(point.x - (node.x + node.w));
      if (screenFace === "top") return Math.abs(point.y - node.y);
      return Math.abs(point.y - (node.y + node.h));
    };
    const distances = (["fL", "fH", "cL", "cH"] as Face[]).map((face) => ({ face, distance: distanceToFace(face) }));
    return distances.sort((a, b) => a.distance - b.distance)[0].face;
  };
  const endpointAxisForFace = (face: Face, point: LayoutPoint): number => {
    const varyFlow = face === "cL" || face === "cH";
    return varyFlow
      ? (horizontal ? point.x : point.y)
      : (horizontal ? point.y : point.x);
  };
  type RoutedEndpoint = { edge: LayoutEdge; pointIndex: number; adjacentIndex: number; nodeId: string; face: Face; sortKey: number };
  const endpointEntries: RoutedEndpoint[] = [];
  for (const item of routedPlans) {
    const points = item.edge.points;
    if (points.length < 2) continue;
    const srcFace = inferFaceFromPoint(item.plan.e.from, points[0], points[1]);
    const dstFace = inferFaceFromPoint(item.plan.e.to, points[points.length - 1], points[points.length - 2]);
    endpointEntries.push({
      edge: item.edge,
      pointIndex: 0,
      adjacentIndex: 1,
      nodeId: item.plan.e.from,
      face: srcFace,
      sortKey: endpointAxisForFace(srcFace, points[1]),
    });
    endpointEntries.push({
      edge: item.edge,
      pointIndex: points.length - 1,
      adjacentIndex: points.length - 2,
      nodeId: item.plan.e.to,
      face: dstFace,
      sortKey: endpointAxisForFace(dstFace, points[points.length - 2]),
    });
  }
  const endpointGroups = new Map<string, RoutedEndpoint[]>();
  for (const entry of endpointEntries) {
    (endpointGroups.get(`${entry.nodeId}|${entry.face}`) ?? (endpointGroups.set(`${entry.nodeId}|${entry.face}`, []), endpointGroups.get(`${entry.nodeId}|${entry.face}`)!)).push(entry);
  }
  for (const group of endpointGroups.values()) {
    if (group.length <= 1) continue;
    const face = group[0].face;
    const node = laid.get(group[0].nodeId)!;
    const varyFlow = face === "cL" || face === "cH";
    const low = varyFlow ? (horizontal ? node.x : node.y) : (horizontal ? node.y : node.x);
    const size = varyFlow ? (horizontal ? node.w : node.h) : (horizontal ? node.h : node.w);
    const min = low + FACE_INSET;
    const max = low + size - FACE_INSET;
    const span = Math.max(1, max - min);
    group.sort((a, b) => a.sortKey - b.sortKey || a.edge.id.localeCompare(b.edge.id));
    const minSep = Math.min(18, span / Math.max(1, group.length - 1));
    let positions = group.map((_, index) => {
      const base = min + (span * (index + 1)) / (group.length + 1);
      return Math.min(max, Math.max(min, base));
    });
    for (let i = 1; i < positions.length; i++) positions[i] = Math.max(positions[i], positions[i - 1] + minSep);
    const overflow = positions[positions.length - 1] - max;
    if (overflow > 0) positions = positions.map((pos) => pos - overflow);
    for (let i = positions.length - 2; i >= 0; i--) positions[i] = Math.min(positions[i], positions[i + 1] - minSep);
    const underflow = min - positions[0];
    if (underflow > 0) positions = positions.map((pos) => pos + underflow);
    group.forEach((entry, index) => {
      const original = entry.edge.points.map((point) => ({ ...point }));
      const originalEndpoint = original[entry.pointIndex];
      const originalAxis = varyFlow
        ? (horizontal ? originalEndpoint.x : originalEndpoint.y)
        : (horizontal ? originalEndpoint.y : originalEndpoint.x);
      const spread = (index - (group.length - 1) / 2) * Math.max(minSep, 6);
      const candidates = [
        positions[index],
        originalAxis + spread,
        originalAxis - spread,
        originalAxis - 6,
        originalAxis + 6,
        originalAxis - 12,
        originalAxis + 12,
        originalAxis - 18,
        originalAxis + 18,
        originalAxis - 30,
        originalAxis + 30,
      ].map((value) => Math.min(max, Math.max(min, value)));
      for (const candidate of [...new Set(candidates.map((value) => Math.round(value * 10) / 10))]) {
        entry.edge.points = original.map((point) => ({ ...point }));
        const end: End = {
          node: entry.nodeId,
          face: entry.face,
          flow: varyFlow ? candidate : entry.face === "fL" ? geom(entry.nodeId).flowLow : entry.face === "fH" ? geom(entry.nodeId).flowHigh : geom(entry.nodeId).flowCenter,
          cross: varyFlow ? entry.face === "cL" ? geom(entry.nodeId).crossLow : entry.face === "cH" ? geom(entry.nodeId).crossHigh : geom(entry.nodeId).crossCenter : candidate,
        };
        projectEnd(end);
        const nextPoint = toXY(end.flow, end.cross, horizontal);
        const adjacent = entry.edge.points[entry.adjacentIndex];
        const previousEndpoint = entry.edge.points[entry.pointIndex];
        entry.edge.points[entry.pointIndex] = nextPoint;
        if (Math.abs(adjacent.x - previousEndpoint.x) < 0.5) adjacent.x = nextPoint.x;
        if (Math.abs(adjacent.y - previousEndpoint.y) < 0.5) adjacent.y = nextPoint.y;
        const simplified = simplifyPolyline(entry.edge.points);
        if (routeNodeHits(simplified, entry.edge.from, entry.edge.to) === 0 && routeBorderCoincidence(simplified, entry.edge.from, entry.edge.to) === 0) {
          entry.edge.points = simplified;
          return;
        }
      }
      entry.edge.points = original;
    });
  }
  const setEndpointOnFace = (entry: RoutedEndpoint, face: Face, axisValue: number, requireClearRoute = true): boolean => {
    const original = entry.edge.points.map((point) => ({ ...point }));
    const node = laid.get(entry.nodeId)!;
    const varyFlow = face === "cL" || face === "cH";
    const low = varyFlow ? (horizontal ? node.x : node.y) : (horizontal ? node.y : node.x);
    const size = varyFlow ? (horizontal ? node.w : node.h) : (horizontal ? node.h : node.w);
    const min = low + FACE_INSET;
    const max = low + size - FACE_INSET;
    const candidate = Math.min(max, Math.max(min, axisValue));
    const end: End = {
      node: entry.nodeId,
      face,
      flow: varyFlow ? candidate : face === "fL" ? geom(entry.nodeId).flowLow : face === "fH" ? geom(entry.nodeId).flowHigh : geom(entry.nodeId).flowCenter,
      cross: varyFlow ? face === "cL" ? geom(entry.nodeId).crossLow : face === "cH" ? geom(entry.nodeId).crossHigh : geom(entry.nodeId).crossCenter : candidate,
    };
    projectEnd(end);
    const nextPoint = toXY(end.flow, end.cross, horizontal);
    const adjacent = entry.edge.points[entry.adjacentIndex];
    const previousEndpoint = entry.edge.points[entry.pointIndex];
    entry.edge.points[entry.pointIndex] = nextPoint;
    if (Math.abs(adjacent.x - previousEndpoint.x) < 0.5) adjacent.x = nextPoint.x;
    if (Math.abs(adjacent.y - previousEndpoint.y) < 0.5) adjacent.y = nextPoint.y;
    const simplified = simplifyPolyline(entry.edge.points);
    if (!requireClearRoute || (routeNodeHits(simplified, entry.edge.from, entry.edge.to) === 0 && routeBorderCoincidence(simplified, entry.edge.from, entry.edge.to) === 0)) {
      entry.edge.points = simplified;
      return true;
    }
    entry.edge.points = original;
    return false;
  };
  const endpointIsOnFace = (nodeId: string, point: LayoutPoint, face: Face): boolean => {
    const node = laid.get(nodeId)!;
    const screenFace = boxFace(face);
    if (screenFace === "left") return Math.abs(point.x - node.x) < 0.5;
    if (screenFace === "right") return Math.abs(point.x - (node.x + node.w)) < 0.5;
    if (screenFace === "top") return Math.abs(point.y - node.y) < 0.5;
    return Math.abs(point.y - (node.y + node.h)) < 0.5;
  };
  for (const entry of endpointEntries) {
    const point = entry.edge.points[entry.pointIndex];
    const adjacent = entry.edge.points[entry.adjacentIndex];
    if (!point || !adjacent) continue;
    const face = inferFaceFromPoint(entry.nodeId, point, adjacent);
    if (endpointIsOnFace(entry.nodeId, point, face)) continue;
    const axisValue = endpointAxisForFace(face, point);
    setEndpointOnFace(entry, face, axisValue, false);
  }
  const exactEndpointGroups = new Map<string, RoutedEndpoint[]>();
  for (const entry of endpointEntries) {
    const point = entry.edge.points[entry.pointIndex];
    const adjacent = entry.edge.points[entry.adjacentIndex];
    if (!point || !adjacent) continue;
    const face = inferFaceFromPoint(entry.nodeId, point, adjacent);
    const key = `${entry.nodeId}|${face}|${Math.round(point.x * 2) / 2}|${Math.round(point.y * 2) / 2}`;
    (exactEndpointGroups.get(key) ?? (exactEndpointGroups.set(key, []), exactEndpointGroups.get(key)!)).push({ ...entry, face });
  }
  for (const group of exactEndpointGroups.values()) {
    if (group.length <= 1) continue;
    const face = group[0].face;
    const node = laid.get(group[0].nodeId)!;
    const varyFlow = face === "cL" || face === "cH";
    const low = varyFlow ? (horizontal ? node.x : node.y) : (horizontal ? node.y : node.x);
    const size = varyFlow ? (horizontal ? node.w : node.h) : (horizontal ? node.h : node.w);
    const min = low + FACE_INSET;
    const max = low + size - FACE_INSET;
    const span = Math.max(1, max - min);
    group
      .sort((a, b) => a.edge.id.localeCompare(b.edge.id))
      .forEach((entry, index) => {
        const axisValue = min + (span * (index + 1)) / (group.length + 1);
        setEndpointOnFace(entry, face, axisValue);
      });
  }
  const finalEndpointRecords = (): Array<{ edgeId: string; x: number; y: number }> =>
    routedPlans.flatMap((item) => {
      const points = item.edge.points;
      return [
        { edgeId: item.edge.id, x: points[0].x, y: points[0].y },
        { edgeId: item.edge.id, x: points[points.length - 1].x, y: points[points.length - 1].y },
      ];
    });
  const finalCoordConflict = (edgeId: string, points: LayoutPoint[], records = finalEndpointRecords()): number => {
    let score = 0;
    for (const point of points.slice(1, -1)) {
      for (const endpoint of records) {
        if (endpoint.edgeId === edgeId) continue;
        if (Math.abs(point.x - endpoint.x) < 0.5) score++;
        if (Math.abs(point.y - endpoint.y) < 0.5) score++;
      }
    }
    return score;
  };
  const finalPointConflicts = (edgeId: string, point: LayoutPoint, records: Array<{ edgeId: string; x: number; y: number }>): boolean =>
    records.some((endpoint) => endpoint.edgeId !== edgeId && (Math.abs(point.x - endpoint.x) < 0.5 || Math.abs(point.y - endpoint.y) < 0.5));
  for (const item of routedPlans) {
    const records = finalEndpointRecords();
    let points = item.edge.points;
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const point = points[i];
      const next = points[i + 1];
      if (!finalPointConflicts(item.edge.id, point, records)) continue;
      const prevV = Math.abs(prev.x - point.x) < 0.5;
      const prevH = Math.abs(prev.y - point.y) < 0.5;
      const nextV = Math.abs(next.x - point.x) < 0.5;
      const nextH = Math.abs(next.y - point.y) < 0.5;
      const candidates: LayoutPoint[][] = [];
      for (const offset of [12, -12, 24, -24, 36, -36, 48, -48, 60, -60]) {
        if (prevV && nextH) {
          const y = point.y + offset;
          candidates.push([...points.slice(0, i), { x: point.x, y }, { x: next.x, y }, ...points.slice(i + 1)]);
        } else if (prevH && nextV) {
          const x = point.x + offset;
          candidates.push([...points.slice(0, i), { x, y: point.y }, { x, y: next.y }, ...points.slice(i + 1)]);
        }
      }
      const replacement = candidates
        .map((candidate) => simplifyPolyline(candidate))
        .filter((candidate) => routeNodeHits(candidate, item.edge.from, item.edge.to) === 0 && routeBorderCoincidence(candidate, item.edge.from, item.edge.to) === 0)
        .sort((a, b) => finalCoordConflict(item.edge.id, a, records) - finalCoordConflict(item.edge.id, b, records) || routeLength(a) - routeLength(b))[0];
      if (replacement && finalCoordConflict(item.edge.id, replacement, records) < finalCoordConflict(item.edge.id, points, records)) {
        points = replacement;
        item.edge.points = replacement;
      }
    }
  }
  const componentPadding = 8;
  const inflatedNodeBox = (node: LayoutNode) => ({
    x0: node.x - componentPadding,
    y0: node.y - componentPadding,
    x1: node.x + node.w + componentPadding,
    y1: node.y + node.h + componentPadding,
  });
  const segmentHitsBox = (a: LayoutPoint, b: LayoutPoint, box: { x0: number; y0: number; x1: number; y1: number }): boolean => {
    const horizontalSeg = Math.abs(a.y - b.y) < 0.5;
    const verticalSeg = Math.abs(a.x - b.x) < 0.5;
    if (horizontalSeg) {
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      return a.y > box.y0 && a.y < box.y1 && Math.min(x1, box.x1) - Math.max(x0, box.x0) > 0.5;
    }
    if (verticalSeg) {
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      return a.x > box.x0 && a.x < box.x1 && Math.min(y1, box.y1) - Math.max(y0, box.y0) > 0.5;
    }
    return true;
  };
  const routeComponentHits = (points: LayoutPoint[], from: string, to: string): number => {
    let hits = 0;
    for (let i = 0; i < points.length - 1; i++) {
      for (const node of laid.values()) {
        if (node.id === from || node.id === to) continue;
        if (segmentHitsBox(points[i], points[i + 1], inflatedNodeBox(node))) hits++;
      }
    }
    return hits;
  };
  const endpointUseKey = (nodeId: string, point: LayoutPoint): string => {
    const side = finalEndpointSide(nodeId, point);
    const axis = side === "left" || side === "right" ? point.y : point.x;
    return `${nodeId}|${side}|${Math.round(axis * 10) / 10}`;
  };
  const componentSafeRoute = (edge: LayoutEdge, endpointUse?: Map<string, number>): LayoutPoint[] | undefined => {
    if (routeComponentHits(edge.points, edge.from, edge.to) === 0) return edge.points;
    const faces: Face[] = ["fL", "fH", "cL", "cH"];
    const alongs = [0.15, 0.32, 0.5, 0.68, 0.85];
    const uniquePoints = (points: LayoutPoint[]): LayoutPoint[] => {
      const seen = new Set<string>();
      return points.filter((point) => {
        const key = `${Math.round(point.x * 10) / 10},${Math.round(point.y * 10) / 10}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    const originalStart = edge.points[0];
    const originalEnd = edge.points[edge.points.length - 1];
    const sourcePorts = uniquePoints([
      originalStart,
      ...faces.flatMap((face) => alongs.map((along) => toXY(facePoint(edge.from, face, along).flow, facePoint(edge.from, face, along).cross, horizontal))),
    ]);
    const targetPorts = uniquePoints([
      originalEnd,
      ...faces.flatMap((face) => alongs.map((along) => toXY(facePoint(edge.to, face, along).flow, facePoint(edge.to, face, along).cross, horizontal))),
    ]);
    const obstacles = [...laid.values()].filter((node) => node.id !== edge.from && node.id !== edge.to).map(inflatedNodeBox);
    const validSegment = (a: LayoutPoint, b: LayoutPoint): boolean =>
      (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) && obstacles.every((box) => !segmentHitsBox(a, b, box));
    const directCandidates = sourcePorts.flatMap((src) => targetPorts.flatMap((dst) => {
      const paths: LayoutPoint[][] = [];
      if (Math.abs(src.x - dst.x) < 0.5 || Math.abs(src.y - dst.y) < 0.5) paths.push([src, dst]);
      paths.push([src, { x: dst.x, y: src.y }, dst]);
      paths.push([src, { x: src.x, y: dst.y }, dst]);
      return paths.map(simplifyPolyline);
    }));
    const direct = directCandidates
      .filter((route) => route.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))
      .filter((route) => route.slice(0, -1).every((point, i) => validSegment(point, route[i + 1])))
      .sort((a, b) => {
        const endpointMove = (route: LayoutPoint[]) =>
          Math.abs(route[0].x - originalStart.x) + Math.abs(route[0].y - originalStart.y) +
          Math.abs(route[route.length - 1].x - originalEnd.x) + Math.abs(route[route.length - 1].y - originalEnd.y);
        const endpointUseCost = (route: LayoutPoint[]) => {
          if (!endpointUse) return 0;
          const startKey = endpointUseKey(edge.from, route[0]);
          const endKey = endpointUseKey(edge.to, route[route.length - 1]);
          return ((endpointUse.get(startKey) ?? 0) + (endpointUse.get(endKey) ?? 0)) * 10000;
        };
        return endpointUseCost(a) - endpointUseCost(b) || routeLength(a) - routeLength(b) || endpointMove(a) - endpointMove(b) || a.length - b.length;
      })[0];
    if (direct) return direct;

    const xs = new Set<number>();
    const ys = new Set<number>();
    const addPoint = (point: LayoutPoint) => {
      xs.add(Math.round(point.x * 10) / 10);
      ys.add(Math.round(point.y * 10) / 10);
    };
    sourcePorts.forEach(addPoint);
    targetPorts.forEach(addPoint);
    for (const box of obstacles) {
      [box.x0 - 12, box.x1 + 12].forEach((x) => xs.add(Math.round(x * 10) / 10));
      [box.y0 - 12, box.y1 + 12].forEach((y) => ys.add(Math.round(y * 10) / 10));
    }
    const xList = [...xs].sort((a, b) => a - b);
    const yList = [...ys].sort((a, b) => a - b);
    const keyOf = (point: LayoutPoint) => `${point.x},${point.y}`;
    const grid = xList.flatMap((x) => yList.map((y) => ({ x, y })));
    const sourceKeys = new Set(sourcePorts.map((point) => keyOf({ x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 })));
    const targetKeys = new Set(targetPorts.map((point) => keyOf({ x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 })));
    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    const queue: Array<{ key: string; point: LayoutPoint; cost: number }> = [];
    for (const point of grid) {
      const key = keyOf(point);
      if (!sourceKeys.has(key)) continue;
      dist.set(key, 0);
      queue.push({ key, point, cost: 0 });
    }
    const pointByKey = new Map(grid.map((point) => [keyOf(point), point]));
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift()!;
      if (current.cost !== dist.get(current.key)) continue;
      if (targetKeys.has(current.key)) {
        const route: LayoutPoint[] = [];
        let key: string | undefined = current.key;
        while (key) {
          route.push(pointByKey.get(key)!);
          key = prev.get(key);
        }
        return simplifyPolyline(route.reverse());
      }
      const cx = xList.indexOf(current.point.x);
      const cy = yList.indexOf(current.point.y);
      const neighbors = [
        cx > 0 ? { x: xList[cx - 1], y: current.point.y } : undefined,
        cx < xList.length - 1 ? { x: xList[cx + 1], y: current.point.y } : undefined,
        cy > 0 ? { x: current.point.x, y: yList[cy - 1] } : undefined,
        cy < yList.length - 1 ? { x: current.point.x, y: yList[cy + 1] } : undefined,
      ].filter((point): point is LayoutPoint => !!point);
      for (const next of neighbors) {
        if (!validSegment(current.point, next)) continue;
        const nextKey = keyOf(next);
        const cost = current.cost + Math.abs(next.x - current.point.x) + Math.abs(next.y - current.point.y);
        if (cost >= (dist.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
        dist.set(nextKey, cost);
        prev.set(nextKey, current.key);
        queue.push({ key: nextKey, point: next, cost });
      }
    }
    return undefined;
  };
  for (const item of routedPlans) {
    const repaired = componentSafeRoute(item.edge);
    if (repaired && routeComponentHits(repaired, item.edge.from, item.edge.to) === 0) item.edge.points = repaired;
  }
  const finalEndpointSide = (nodeId: string, point: LayoutPoint): BoxFace => {
    const node = laid.get(nodeId)!;
    const distances = [
      { side: "left" as BoxFace, distance: Math.abs(point.x - node.x) },
      { side: "right" as BoxFace, distance: Math.abs(point.x - (node.x + node.w)) },
      { side: "top" as BoxFace, distance: Math.abs(point.y - node.y) },
      { side: "bottom" as BoxFace, distance: Math.abs(point.y - (node.y + node.h)) },
    ];
    return distances.sort((a, b) => a.distance - b.distance)[0].side;
  };
  const moveFinalEndpoint = (entry: RoutedEndpoint, side: BoxFace, axisValue: number): void => {
    const node = laid.get(entry.nodeId)!;
    const x = side === "left" ? node.x : side === "right" ? node.x + node.w : Math.min(node.x + node.w - FACE_INSET, Math.max(node.x + FACE_INSET, axisValue));
    const y = side === "top" ? node.y : side === "bottom" ? node.y + node.h : Math.min(node.y + node.h - FACE_INSET, Math.max(node.y + FACE_INSET, axisValue));
    const nextPoint = boundaryPoint(node, side, { x, y });
    const adjacent = entry.edge.points[entry.adjacentIndex];
    const previousEndpoint = entry.edge.points[entry.pointIndex];
    entry.edge.points[entry.pointIndex] = nextPoint;
    if (Math.abs(adjacent.x - previousEndpoint.x) < 0.5) adjacent.x = nextPoint.x;
    if (Math.abs(adjacent.y - previousEndpoint.y) < 0.5) adjacent.y = nextPoint.y;
    entry.edge.points = simplifyPolyline(entry.edge.points);
  };
  const spaceFinalEndpoints = (): void => {
    const finalEndpointEntries: RoutedEndpoint[] = [];
    for (const item of routedPlans) {
      const points = item.edge.points;
      if (points.length < 2) continue;
      finalEndpointEntries.push({
        edge: item.edge,
        pointIndex: 0,
        adjacentIndex: 1,
        nodeId: item.plan.e.from,
        face: inferFaceFromPoint(item.plan.e.from, points[0], points[1]),
        sortKey: 0,
      });
      finalEndpointEntries.push({
        edge: item.edge,
        pointIndex: points.length - 1,
        adjacentIndex: points.length - 2,
        nodeId: item.plan.e.to,
        face: inferFaceFromPoint(item.plan.e.to, points[points.length - 1], points[points.length - 2]),
        sortKey: 0,
      });
    }
    const finalSideGroups = new Map<string, RoutedEndpoint[]>();
    for (const entry of finalEndpointEntries) {
      const point = entry.edge.points[entry.pointIndex];
      const side = finalEndpointSide(entry.nodeId, point);
      const axis = side === "left" || side === "right" ? point.y : point.x;
      entry.sortKey = axis;
      (finalSideGroups.get(`${entry.nodeId}|${side}`) ?? (finalSideGroups.set(`${entry.nodeId}|${side}`, []), finalSideGroups.get(`${entry.nodeId}|${side}`)!)).push(entry);
    }
    for (const [key, group] of finalSideGroups) {
      if (group.length <= 1) continue;
      const [nodeId, sideValue] = key.split("|") as [string, BoxFace];
      const node = laid.get(nodeId)!;
      const side = sideValue;
      const low = side === "left" || side === "right" ? node.y : node.x;
      const size = side === "left" || side === "right" ? node.h : node.w;
      const min = low + FACE_INSET;
      const max = low + size - FACE_INSET;
      const span = Math.max(1, max - min);
      group.sort((a, b) => a.sortKey - b.sortKey || a.edge.id.localeCompare(b.edge.id));
      const positions = group.map((entry) => Math.min(max, Math.max(min, entry.sortKey)));
      for (let i = 1; i < positions.length; i++) {
        if (positions[i] - positions[i - 1] >= 6) continue;
        const start = min + (span * i) / (group.length + 1);
        const end = min + (span * (i + 1)) / (group.length + 1);
        positions[i - 1] = Math.min(max, Math.max(min, start));
        positions[i] = Math.min(max, Math.max(min, end));
      }
      group.forEach((entry, index) => moveFinalEndpoint(entry, side, positions[index]));
    }
  };
  spaceFinalEndpoints();
  const normalStubPoint = (point: LayoutPoint, side: BoxFace, distance = 14): LayoutPoint => {
    if (side === "left") return { x: point.x - distance, y: point.y };
    if (side === "right") return { x: point.x + distance, y: point.y };
    if (side === "top") return { x: point.x, y: point.y - distance };
    return { x: point.x, y: point.y + distance };
  };
  const endpointSegmentIsNormal = (side: BoxFace, endpoint: LayoutPoint, adjacent: LayoutPoint): boolean =>
    side === "left" || side === "right"
      ? Math.abs(endpoint.y - adjacent.y) < 0.5
      : Math.abs(endpoint.x - adjacent.x) < 0.5;
  const enforceEndpointStubs = (edge: LayoutEdge): LayoutPoint[] => {
    let points = edge.points.map((point) => ({ ...point }));
    if (points.length < 2) return points;
    const sourceSide = finalEndpointSide(edge.from, points[0]);
    if (!endpointSegmentIsNormal(sourceSide, points[0], points[1])) {
      const stub = normalStubPoint(points[0], sourceSide);
      const next = points[1];
      const connector = sourceSide === "left" || sourceSide === "right"
        ? { x: stub.x, y: next.y }
        : { x: next.x, y: stub.y };
      points = [points[0], stub, connector, ...points.slice(1)];
    }
    const targetIndex = points.length - 1;
    const targetSide = finalEndpointSide(edge.to, points[targetIndex]);
    if (!endpointSegmentIsNormal(targetSide, points[targetIndex], points[targetIndex - 1])) {
      const endpoint = points[targetIndex];
      const stub = normalStubPoint(endpoint, targetSide);
      const prev = points[targetIndex - 1];
      const connector = targetSide === "left" || targetSide === "right"
        ? { x: stub.x, y: prev.y }
        : { x: prev.x, y: stub.y };
      points = [...points.slice(0, targetIndex), connector, stub, endpoint];
    }
    return simplifyPolyline(points);
  };
  const enforceAndRepairFinalRoutes = (): void => {
    const endpointUse = new Map<string, number>();
    for (const item of routedPlans) {
      item.edge.points = enforceEndpointStubs(item.edge);
      const finalRepaired = componentSafeRoute(item.edge, endpointUse);
      if (finalRepaired && routeComponentHits(finalRepaired, item.edge.from, item.edge.to) === 0) {
        item.edge.points = enforceEndpointStubs({ ...item.edge, points: finalRepaired });
      }
      const points = item.edge.points;
      if (points.length >= 2) {
        const startKey = endpointUseKey(item.edge.from, points[0]);
        const endKey = endpointUseKey(item.edge.to, points[points.length - 1]);
        endpointUse.set(startKey, (endpointUse.get(startKey) ?? 0) + 1);
        endpointUse.set(endKey, (endpointUse.get(endKey) ?? 0) + 1);
      }
    }
  };
  for (let i = 0; i < 3; i++) {
    enforceAndRepairFinalRoutes();
    spaceFinalEndpoints();
  }
  enforceAndRepairFinalRoutes();
  return routedPlans.map((item) => {
    item.edge.points = enforceEndpointStubs(item.edge);
    const seg = longestSegment(item.edge.points);
    item.edge.labelAt = seg.orient === "h" ? { x: seg.x, y: seg.y - 11 } : { x: seg.x + 8, y: seg.y };
    item.edge.labelOrient = seg.orient;
    return item.edge;
  });
}
