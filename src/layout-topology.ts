import { computeLayout } from "./layout.js";
import type {
  LayoutBoundary,
  LayoutEdge,
  LayoutNode,
  LayoutPoint,
  LayoutResult,
  LayoutZone,
} from "./layout.js";
import type { ArchMapModel, GraphSubgraph } from "./types.js";

export const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

const CELL_H = 124;
const CELL_W = CELL_H * GOLDEN_RATIO;
const GAP_Y = 32;
const GAP_X = GAP_Y * GOLDEN_RATIO;
const PAD_Y = 40;
const PAD_X = PAD_Y * GOLDEN_RATIO;
const CELL_INSET_Y = 24;
const CELL_INSET_X = CELL_INSET_Y * GOLDEN_RATIO;
export const TOPOLOGY_ZONE_CLEARANCE = 24;

interface Span {
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
}

interface Candidate extends Span {
  cost: number;
}

type Face = "left" | "right" | "top" | "bottom";

function rectFor(span: Span): { x: number; y: number; w: number; h: number } {
  return {
    x: PAD_X + span.column * (CELL_W + GAP_X),
    y: PAD_Y + span.row * (CELL_H + GAP_Y),
    w: span.columnSpan * CELL_W + Math.max(0, span.columnSpan - 1) * GAP_X,
    h: span.rowSpan * CELL_H + Math.max(0, span.rowSpan - 1) * GAP_Y,
  };
}

function requiredSpan(node: LayoutNode): Pick<Span, "rowSpan" | "columnSpan"> {
  return {
    columnSpan: Math.max(1, Math.ceil((node.w + CELL_INSET_X * 2) / (CELL_W + GAP_X))),
    rowSpan: Math.max(1, Math.ceil((node.h + CELL_INSET_Y * 2) / (CELL_H + GAP_Y))),
  };
}

function uniqueAxis(nodes: LayoutNode[], horizontal: boolean): number[] {
  return [...new Set(nodes.map((node) => Math.round((horizontal ? node.x : node.y) * 10) / 10))].sort((a, b) => a - b);
}

function placementHints(model: ArchMapModel): Map<string, Span> {
  const out = new Map<string, Span>();
  for (const hint of model.layout?.grid?.placements ?? []) {
    if (hint.target.type !== "node") continue;
    out.set(hint.target.id, {
      row: Math.max(0, Math.floor(hint.row) - 1),
      column: Math.max(0, Math.floor(hint.column) - 1),
      rowSpan: Math.max(1, Math.floor(hint.rowSpan ?? 1)),
      columnSpan: Math.max(1, Math.floor(hint.columnSpan ?? 1)),
    });
  }
  return out;
}

function canPlace(occupied: boolean[][], span: Span): boolean {
  const size = occupied.length;
  if (span.row < 0 || span.column < 0 || span.row + span.rowSpan > size || span.column + span.columnSpan > size) return false;
  for (let row = span.row; row < span.row + span.rowSpan; row++) {
    for (let column = span.column; column < span.column + span.columnSpan; column++) {
      if (occupied[row][column]) return false;
    }
  }
  return true;
}

function mark(occupied: boolean[][], span: Span): void {
  for (let row = span.row; row < span.row + span.rowSpan; row++) {
    for (let column = span.column; column < span.column + span.columnSpan; column++) occupied[row][column] = true;
  }
}

function unionSpan(current: Span | undefined, next: Span): Span {
  if (!current) return { ...next };
  const row = Math.min(current.row, next.row);
  const column = Math.min(current.column, next.column);
  return {
    row,
    column,
    rowSpan: Math.max(current.row + current.rowSpan, next.row + next.rowSpan) - row,
    columnSpan: Math.max(current.column + current.columnSpan, next.column + next.columnSpan) - column,
  };
}

function spansOverlap(a: Span, b: Span): boolean {
  return a.row < b.row + b.rowSpan && a.row + a.rowSpan > b.row
    && a.column < b.column + b.columnSpan && a.column + a.columnSpan > b.column;
}

function tryPack(model: ArchMapModel, base: LayoutResult, size: number): Map<string, Span> | undefined {
  const horizontal = model.direction === "LR";
  const flowAxis = uniqueAxis(base.nodes, horizontal);
  const crossAxis = uniqueAxis(base.nodes, !horizontal);
  const flowIndex = new Map(flowAxis.map((value, index) => [value, index]));
  const crossIndex = new Map(crossAxis.map((value, index) => [value, index]));
  const hints = placementHints(model);
  const occupied = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const placed = new Map<string, Span>();
  const nodeMeta = new Map(model.nodes.map((node) => [node.id, node]));
  const ordered = [...base.nodes].sort((a, b) => {
    const ah = hints.has(a.id) ? 0 : 1;
    const bh = hints.has(b.id) ? 0 : 1;
    if (ah !== bh) return ah - bh;
    return (horizontal ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x) || a.id.localeCompare(b.id);
  });
  const zoneCenters = new Map<string, Array<{ row: number; column: number }>>();
  const zoneBounds = new Map<string, Span>();

  for (const node of ordered) {
    const required = requiredSpan(node);
    const hinted = hints.get(node.id);
    if (hinted) {
      const span = {
        ...hinted,
        rowSpan: Math.max(hinted.rowSpan, required.rowSpan),
        columnSpan: Math.max(hinted.columnSpan, required.columnSpan),
      };
      const outside = span.row + span.rowSpan > size || span.column + span.columnSpan > size;
      if (outside) return undefined;
      if (canPlace(occupied, span)) {
        mark(occupied, span);
        placed.set(node.id, span);
        const zone = nodeMeta.get(node.id)?.resolvedZone ?? nodeMeta.get(node.id)?.zone;
        if (zone) {
          zoneCenters.set(zone, [...(zoneCenters.get(zone) ?? []), { row: span.row, column: span.column }]);
          zoneBounds.set(zone, unionSpan(zoneBounds.get(zone), span));
        }
        continue;
      }
    }

    const flow = flowIndex.get(Math.round((horizontal ? node.x : node.y) * 10) / 10) ?? 0;
    const cross = crossIndex.get(Math.round((horizontal ? node.y : node.x) * 10) / 10) ?? 0;
    const desiredColumn = horizontal
      ? Math.round(flowAxis.length <= 1 ? (size - required.columnSpan) / 2 : flow * (size - required.columnSpan) / (flowAxis.length - 1))
      : Math.round(crossAxis.length <= 1 ? (size - required.columnSpan) / 2 : cross * (size - required.columnSpan) / (crossAxis.length - 1));
    const desiredRow = horizontal
      ? Math.round(crossAxis.length <= 1 ? (size - required.rowSpan) / 2 : cross * (size - required.rowSpan) / (crossAxis.length - 1))
      : Math.round(flowAxis.length <= 1 ? (size - required.rowSpan) / 2 : flow * (size - required.rowSpan) / (flowAxis.length - 1));
    const zone = nodeMeta.get(node.id)?.resolvedZone ?? nodeMeta.get(node.id)?.zone;
    const zonePoints = zone ? zoneCenters.get(zone) ?? [] : [];
    const candidates: Candidate[] = [];
    for (let row = 0; row <= size - required.rowSpan; row++) {
      for (let column = 0; column <= size - required.columnSpan; column++) {
        const span = { row, column, ...required };
        if (!canPlace(occupied, span)) continue;
        const centerCost = Math.abs(row + required.rowSpan / 2 - size / 2) + Math.abs(column + required.columnSpan / 2 - size / 2);
        const flowCost = horizontal ? Math.abs(column - desiredColumn) : Math.abs(row - desiredRow);
        const crossCost = horizontal ? Math.abs(row - desiredRow) : Math.abs(column - desiredColumn);
        const zoneCost = zonePoints.length === 0 ? 0 : Math.min(...zonePoints.map((point) => Math.abs(point.row - row) + Math.abs(point.column - column)));
        const nextZoneBounds = zone ? unionSpan(zoneBounds.get(zone), span) : undefined;
        const overlapsAnotherZone = nextZoneBounds
          ? [...zoneBounds.entries()].some(([other, bounds]) => other !== zone && spansOverlap(nextZoneBounds, bounds))
          : false;
        if (overlapsAnotherZone) continue;
        candidates.push({ ...span, cost: flowCost * 80 + crossCost * 24 + zoneCost * 18 + centerCost });
      }
    }
    const best = candidates.sort((a, b) => a.cost - b.cost || a.row - b.row || a.column - b.column)[0];
    if (!best) return undefined;
    const span = { row: best.row, column: best.column, rowSpan: best.rowSpan, columnSpan: best.columnSpan };
    mark(occupied, span);
    placed.set(node.id, span);
    if (zone) {
      zoneCenters.set(zone, [...zonePoints, { row: span.row, column: span.column }]);
      zoneBounds.set(zone, unionSpan(zoneBounds.get(zone), span));
    }
  }
  return placed;
}

function pack(model: ArchMapModel, base: LayoutResult): { size: number; placements: Map<string, Span> } {
  const requiredArea = base.nodes.reduce((sum, node) => {
    const span = requiredSpan(node);
    return sum + span.rowSpan * span.columnSpan;
  }, 0);
  const configured = model.layout?.grid?.size;
  const minimum = typeof configured === "number"
    ? Math.max(1, Math.floor(configured))
    : Math.max(2, Math.ceil(Math.sqrt(requiredArea / 0.68)));
  for (let size = minimum; size <= minimum + Math.max(8, base.nodes.length); size++) {
    const placements = tryPack(model, base, size);
    if (placements) return { size, placements };
  }
  throw new Error("Topology grid could not place all components.");
}

function placedNodes(base: LayoutResult, placements: Map<string, Span>): LayoutNode[] {
  return base.nodes.map((node) => {
    const cell = rectFor(placements.get(node.id)!);
    return {
      ...node,
      x: cell.x + (cell.w - node.w) / 2,
      y: cell.y + (cell.h - node.h) / 2,
    };
  });
}

function memberSet(subgraph: GraphSubgraph, children: Map<string | undefined, GraphSubgraph[]>, seen = new Set<string>()): Set<string> {
  if (seen.has(subgraph.id)) return new Set();
  seen.add(subgraph.id);
  const members = new Set(subgraph.members);
  for (const child of children.get(subgraph.id) ?? []) {
    for (const member of memberSet(child, children, seen)) members.add(member);
  }
  seen.delete(subgraph.id);
  return members;
}

function spanBox(spans: Span[], inset = 8): { x: number; y: number; w: number; h: number } | undefined {
  if (spans.length === 0) return undefined;
  const minRow = Math.min(...spans.map((span) => span.row));
  const minColumn = Math.min(...spans.map((span) => span.column));
  const maxRow = Math.max(...spans.map((span) => span.row + span.rowSpan));
  const maxColumn = Math.max(...spans.map((span) => span.column + span.columnSpan));
  const rect = rectFor({ row: minRow, column: minColumn, rowSpan: maxRow - minRow, columnSpan: maxColumn - minColumn });
  return { x: rect.x - inset, y: rect.y - inset, w: rect.w + inset * 2, h: rect.h + inset * 2 };
}

function subgraphGeometry(model: ArchMapModel, placements: Map<string, Span>) {
  const subgraphs = Object.values(model.graph.subgraphs);
  const children = new Map<string | undefined, GraphSubgraph[]>();
  for (const subgraph of subgraphs) children.set(subgraph.parent, [...(children.get(subgraph.parent) ?? []), subgraph]);
  const byId = new Map(subgraphs.map((subgraph) => [subgraph.id, subgraph]));
  const depthOf = (subgraph: GraphSubgraph, seen = new Set<string>()): number => {
    if (!subgraph.parent || !byId.has(subgraph.parent) || seen.has(subgraph.id)) return 0;
    seen.add(subgraph.id);
    return depthOf(byId.get(subgraph.parent)!, seen) + 1;
  };
  return subgraphs.flatMap((subgraph) => {
    const box = spanBox([...memberSet(subgraph, children)].map((id) => placements.get(id)).filter((span): span is Span => !!span), 12);
    return box ? [{ id: subgraph.id, label: subgraph.label ?? subgraph.id, depth: depthOf(subgraph), ...box }] : [];
  });
}

function zoneGeometry(model: ArchMapModel, placements: Map<string, Span>): LayoutZone[] {
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const zoneById = new Map(model.zones.map((zone) => [zone.id, zone]));
  const depthOf = (id: string, seen = new Set<string>()): number => {
    const zone = zoneById.get(id);
    if (!zone?.parent || !zoneById.has(zone.parent) || seen.has(id)) return 0;
    seen.add(id);
    return depthOf(zone.parent, seen) + 1;
  };
  const nodeIdsFor = (id: string): string[] => {
    const direct = model.nodes.filter((node) => (node.resolvedZone ?? node.zone) === id).map((node) => node.id);
    const explicit = (zoneById.get(id)?.resolvedContains ?? []).filter((entry) => entry.type === "node").map((entry) => entry.id);
    const childNodes = model.zones.filter((zone) => zone.parent === id).flatMap((zone) => nodeIdsFor(zone.id));
    return [...new Set([...direct, ...explicit, ...childNodes])];
  };
  return model.zones.flatMap((zone) => {
    const nodeIds = nodeIdsFor(zone.id).filter((id) => nodeById.has(id) && placements.has(id));
    const zoneInset = Math.max(0, (Math.min(GAP_X, GAP_Y) - TOPOLOGY_ZONE_CLEARANCE) / 2);
    const box = spanBox(nodeIds.map((id) => placements.get(id)!), zoneInset);
    if (!box) return [];
    return [{ id: zone.id, label: zone.label ?? zone.id, parent: zone.parent, kind: zone.kind, depth: depthOf(zone.id), z: 0, nodeIds, ...box }];
  });
}

function boundaryGeometry(model: ArchMapModel, placements: Map<string, Span>): LayoutBoundary[] {
  const zoneNodes = new Map(model.zones.map((zone) => [zone.id, model.nodes.filter((node) => (node.resolvedZone ?? node.zone) === zone.id).map((node) => node.id)]));
  return model.boundaries.flatMap((boundary, depth) => {
    const ids: string[] = [];
    for (const entry of boundary.resolvedContains ?? []) {
      if (entry.type === "node") ids.push(entry.id);
      if (entry.type === "zone") ids.push(...(zoneNodes.get(entry.id) ?? []));
    }
    const box = spanBox([...new Set(ids)].map((id) => placements.get(id)).filter((span): span is Span => !!span), 28);
    return box ? [{ id: boundary.id, label: boundary.label ?? boundary.id, kind: boundary.kind, depth, z: 0, ...box }] : [];
  });
}

function nodeCenter(node: LayoutNode): LayoutPoint {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

function preferredFaces(from: LayoutNode, to: LayoutNode): { source: Face; target: Face } {
  const a = nodeCenter(from);
  const b = nodeCenter(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { source: "right", target: "left" } : { source: "left", target: "right" };
  return dy >= 0 ? { source: "bottom", target: "top" } : { source: "top", target: "bottom" };
}

function boundaryPort(node: LayoutNode, face: Face, slot: number, count: number): LayoutPoint {
  const along = count <= 1 ? 0.5 : (slot + 1) / (count + 1);
  const inset = 6;
  let point: LayoutPoint;
  if (face === "left" || face === "right") point = { x: face === "left" ? node.x : node.x + node.w, y: node.y + inset + (node.h - inset * 2) * along };
  else point = { x: node.x + inset + (node.w - inset * 2) * along, y: face === "top" ? node.y : node.y + node.h };
  if (node.shape === "rectangle") return point;
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const rx = node.w / 2;
  const ry = node.h / 2;
  if (node.shape === "circle") {
    if (face === "left" || face === "right") {
      const dx = rx * Math.sqrt(Math.max(0, 1 - ((point.y - cy) / ry) ** 2));
      return { x: cx + (face === "right" ? dx : -dx), y: point.y };
    }
    const dy = ry * Math.sqrt(Math.max(0, 1 - ((point.x - cx) / rx) ** 2));
    return { x: point.x, y: cy + (face === "bottom" ? dy : -dy) };
  }
  if (node.shape === "diamond") {
    if (face === "left" || face === "right") {
      const dx = rx * Math.max(0, 1 - Math.abs(point.y - cy) / ry);
      return { x: cx + (face === "right" ? dx : -dx), y: point.y };
    }
    const dy = ry * Math.max(0, 1 - Math.abs(point.x - cx) / rx);
    return { x: point.x, y: cy + (face === "bottom" ? dy : -dy) };
  }
  return point;
}

function simplify(points: LayoutPoint[]): LayoutPoint[] {
  const out: LayoutPoint[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - point.x) < 0.5 && Math.abs(last.y - point.y) < 0.5) continue;
    if (out.length >= 2) {
      const previous = out[out.length - 2];
      if ((Math.abs(previous.x - last.x) < 0.5 && Math.abs(last.x - point.x) < 0.5) || (Math.abs(previous.y - last.y) < 0.5 && Math.abs(last.y - point.y) < 0.5)) {
        out[out.length - 1] = point;
        continue;
      }
    }
    out.push(point);
  }
  return out;
}

function segmentHitsNode(a: LayoutPoint, b: LayoutPoint, node: LayoutNode, pad = 10): boolean {
  const x0 = node.x - pad;
  const x1 = node.x + node.w + pad;
  const y0 = node.y - pad;
  const y1 = node.y + node.h + pad;
  if (Math.abs(a.y - b.y) < 0.5) return a.y > y0 && a.y < y1 && Math.min(a.x, b.x) < x1 && Math.max(a.x, b.x) > x0;
  if (Math.abs(a.x - b.x) < 0.5) return a.x > x0 && a.x < x1 && Math.min(a.y, b.y) < y1 && Math.max(a.y, b.y) > y0;
  return true;
}

function routeCandidates(a: LayoutPoint, b: LayoutPoint, source: Face, target: Face, width: number, height: number): LayoutPoint[][] {
  const sourceHorizontal = source === "left" || source === "right";
  const targetHorizontal = target === "left" || target === "right";
  const candidates: LayoutPoint[][] = [];
  const outward = (point: LayoutPoint, face: Face, distance = 24): LayoutPoint => {
    if (face === "left") return { x: point.x - distance, y: point.y };
    if (face === "right") return { x: point.x + distance, y: point.y };
    if (face === "top") return { x: point.x, y: point.y - distance };
    return { x: point.x, y: point.y + distance };
  };
  const aOut = outward(a, source);
  const bOut = outward(b, target);
  if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) candidates.push([a, b]);
  if (sourceHorizontal !== targetHorizontal) candidates.push(sourceHorizontal ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b]);
  if (sourceHorizontal && targetHorizontal) {
    for (const x of [(a.x + b.x) / 2, Math.min(a.x, b.x) - GAP_X / 2, Math.max(a.x, b.x) + GAP_X / 2, PAD_X / 2, width - PAD_X / 2]) candidates.push([a, { x, y: a.y }, { x, y: b.y }, b]);
  } else if (!sourceHorizontal && !targetHorizontal) {
    for (const y of [(a.y + b.y) / 2, Math.min(a.y, b.y) - GAP_Y / 2, Math.max(a.y, b.y) + GAP_Y / 2, PAD_Y / 2, height - PAD_Y / 2]) candidates.push([a, { x: a.x, y }, { x: b.x, y }, b]);
  }
  candidates.push([a, { x: a.x, y: PAD_Y / 2 }, { x: b.x, y: PAD_Y / 2 }, b]);
  candidates.push([a, { x: a.x, y: height - PAD_Y / 2 }, { x: b.x, y: height - PAD_Y / 2 }, b]);
  candidates.push([a, { x: PAD_X / 2, y: a.y }, { x: PAD_X / 2, y: b.y }, b]);
  candidates.push([a, { x: width - PAD_X / 2, y: a.y }, { x: width - PAD_X / 2, y: b.y }, b]);
  candidates.push([a, aOut, { x: bOut.x, y: aOut.y }, bOut, b]);
  candidates.push([a, aOut, { x: aOut.x, y: bOut.y }, bOut, b]);
  for (const y of [PAD_Y / 2, height - PAD_Y / 2]) candidates.push([a, aOut, { x: aOut.x, y }, { x: bOut.x, y }, bOut, b]);
  for (const x of [PAD_X / 2, width - PAD_X / 2]) candidates.push([a, aOut, { x, y: aOut.y }, { x, y: bOut.y }, bOut, b]);
  const leavesFace = (face: Face, start: LayoutPoint, next: LayoutPoint): boolean => {
    if (face === "left") return Math.abs(start.y - next.y) < 0.5 && next.x < start.x;
    if (face === "right") return Math.abs(start.y - next.y) < 0.5 && next.x > start.x;
    if (face === "top") return Math.abs(start.x - next.x) < 0.5 && next.y < start.y;
    return Math.abs(start.x - next.x) < 0.5 && next.y > start.y;
  };
  const entersFace = (face: Face, previous: LayoutPoint, end: LayoutPoint): boolean => {
    if (face === "left") return Math.abs(previous.y - end.y) < 0.5 && previous.x < end.x;
    if (face === "right") return Math.abs(previous.y - end.y) < 0.5 && previous.x > end.x;
    if (face === "top") return Math.abs(previous.x - end.x) < 0.5 && previous.y < end.y;
    return Math.abs(previous.x - end.x) < 0.5 && previous.y > end.y;
  };
  return candidates
    .map(simplify)
    .filter((points) => points.length >= 2 && leavesFace(source, points[0], points[1]) && entersFace(target, points[points.length - 2], points[points.length - 1]));
}

function segmentKey(a: LayoutPoint, b: LayoutPoint): string {
  return `${Math.round(a.x)}:${Math.round(a.y)}:${Math.round(b.x)}:${Math.round(b.y)}`;
}

function routeTopologyEdges(model: ArchMapModel, nodes: LayoutNode[], width: number, height: number): LayoutEdge[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const valid = model.edges.filter((edge) => byId.has(edge.from) && byId.has(edge.to));
  const faces = valid.map((edge) => preferredFaces(byId.get(edge.from)!, byId.get(edge.to)!));
  const ports = new Map<string, Array<{ edge: number; partner: number }>>();
  valid.forEach((edge, index) => {
    const a = nodeCenter(byId.get(edge.from)!);
    const b = nodeCenter(byId.get(edge.to)!);
    for (const [id, face, partner] of [[edge.from, faces[index].source, faces[index].source === "left" || faces[index].source === "right" ? b.y : b.x], [edge.to, faces[index].target, faces[index].target === "left" || faces[index].target === "right" ? a.y : a.x]] as const) {
      const key = `${id}|${face}`;
      ports.set(key, [...(ports.get(key) ?? []), { edge: index, partner }]);
    }
  });
  for (const entries of ports.values()) entries.sort((a, b) => a.partner - b.partner || a.edge - b.edge);
  const usedSegments = new Map<string, number>();

  return valid.map((edge, index) => {
    const from = byId.get(edge.from)!;
    const to = byId.get(edge.to)!;
    const sourceFace = faces[index].source;
    const targetFace = faces[index].target;
    const sourceEntries = ports.get(`${edge.from}|${sourceFace}`)!;
    const targetEntries = ports.get(`${edge.to}|${targetFace}`)!;
    const a = boundaryPort(from, sourceFace, sourceEntries.findIndex((entry) => entry.edge === index), sourceEntries.length);
    const b = boundaryPort(to, targetFace, targetEntries.findIndex((entry) => entry.edge === index), targetEntries.length);
    const candidates = routeCandidates(a, b, sourceFace, targetFace, width, height);
    const scored = candidates.map((points) => {
      let hits = 0;
      let length = 0;
      let overlap = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const p = points[i];
        const q = points[i + 1];
        length += Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
        overlap += usedSegments.get(segmentKey(p, q)) ?? 0;
        for (const node of nodes) {
          if (node.id === edge.from || node.id === edge.to) continue;
          if (segmentHitsNode(p, q, node)) hits++;
        }
      }
      return { points, score: hits * 100000 + overlap * 3000 + Math.max(0, points.length - 2) * 120 + length };
    }).sort((left, right) => left.score - right.score || left.points.length - right.points.length);
    const points = scored[0]?.points ?? [a, b];
    for (let i = 0; i < points.length - 1; i++) {
      const key = segmentKey(points[i], points[i + 1]);
      usedSegments.set(key, (usedSegments.get(key) ?? 0) + 1);
    }
    let longest = 0;
    let labelAt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let labelOrient: "h" | "v" = "h";
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i];
      const q = points[i + 1];
      const length = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      if (length <= longest) continue;
      longest = length;
      labelOrient = Math.abs(q.y - p.y) < 0.5 ? "h" : "v";
      labelAt = labelOrient === "h" ? { x: (p.x + q.x) / 2, y: p.y - 12 } : { x: p.x + 12, y: (p.y + q.y) / 2 };
    }
    return { id: edge.id, from: edge.from, to: edge.to, label: edge.label, points, labelAt, labelOrient };
  });
}

export function computeTopologyLayout(model: ArchMapModel): LayoutResult {
  const base = computeLayout(model, { direction: model.direction, laneGap: 96 });
  const { size, placements } = pack(model, base);
  const nodes = placedNodes(base, placements);
  const width = size * CELL_W + Math.max(0, size - 1) * GAP_X + PAD_X * 2;
  const height = size * CELL_H + Math.max(0, size - 1) * GAP_Y + PAD_Y * 2;
  const zones = zoneGeometry(model, placements);
  const boundaries = boundaryGeometry(model, placements);
  const subgraphs = subgraphGeometry(model, placements);
  const edges = routeTopologyEdges(model, nodes, width, height);
  return {
    direction: model.direction,
    width,
    height,
    depth: base.depth,
    nodes,
    zones,
    boundaries,
    edges,
    grid: {
      ratio: GOLDEN_RATIO,
      size,
      cellWidth: CELL_W,
      cellHeight: CELL_H,
      gapX: GAP_X,
      gapY: GAP_Y,
      paddingX: PAD_X,
      paddingY: PAD_Y,
      placements: Object.fromEntries(placements),
      subgraphs,
    },
  };
}
