import type { ContainerBoundary, Crossing } from "./topology.js";

export interface CrossingPoint { x: number; y: number }
export interface CrossingRect extends CrossingPoint { id: string; w: number; h: number }

export interface CrossingFocusOptions {
  roles?: readonly string[];
  edgeIds?: readonly string[];
  boundaryIds?: readonly string[];
  showLabels?: boolean;
}

export interface CrossingVisualInput {
  crossings: readonly Crossing[];
  containers: readonly ContainerBoundary[];
  visibleContainerIds: ReadonlySet<string>;
  containerBoxes: ReadonlyMap<string, CrossingRect>;
  edgePoints: ReadonlyMap<string, readonly CrossingPoint[]>;
  blockers?: readonly CrossingRect[];
}

export interface CrossingVisual {
  id: string;
  edgeId: string;
  boundaryId: string;
  boundaryLabel: string;
  direction: Crossing["direction"];
  roles: readonly string[];
  point: CrossingPoint;
  labelPoint: CrossingPoint;
  labelBox: CrossingRect;
  visibleBoundary: boolean;
}

const EPSILON = 0.01;

function inside(point: CrossingPoint, rect: CrossingRect): boolean {
  return point.x >= rect.x - EPSILON && point.x <= rect.x + rect.w + EPSILON
    && point.y >= rect.y - EPSILON && point.y <= rect.y + rect.h + EPSILON;
}

function segmentRectIntersections(a: CrossingPoint, b: CrossingPoint, rect: CrossingRect): Array<{ t: number; point: CrossingPoint }> {
  const candidates: Array<{ t: number; point: CrossingPoint }> = [];
  const add = (t: number): void => {
    if (t < -EPSILON || t > 1 + EPSILON) return;
    const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (point.x < rect.x - EPSILON || point.x > rect.x + rect.w + EPSILON) return;
    if (point.y < rect.y - EPSILON || point.y > rect.y + rect.h + EPSILON) return;
    if (!candidates.some((entry) => Math.abs(entry.point.x - point.x) < EPSILON && Math.abs(entry.point.y - point.y) < EPSILON)) {
      candidates.push({ t, point });
    }
  };
  if (Math.abs(b.x - a.x) > EPSILON) {
    add((rect.x - a.x) / (b.x - a.x));
    add((rect.x + rect.w - a.x) / (b.x - a.x));
  }
  if (Math.abs(b.y - a.y) > EPSILON) {
    add((rect.y - a.y) / (b.y - a.y));
    add((rect.y + rect.h - a.y) / (b.y - a.y));
  }
  return candidates.sort((left, right) => left.t - right.t);
}

function visibleIntersection(points: readonly CrossingPoint[], rect: CrossingRect, direction: Crossing["direction"]): CrossingPoint | undefined {
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const aInside = inside(a, rect);
    const bInside = inside(b, rect);
    if (aInside === bInside) continue;
    const isExit = aInside && !bInside;
    if ((direction === "exit") !== isExit) continue;
    const intersections = segmentRectIntersections(a, b, rect);
    return isExit ? intersections[intersections.length - 1]?.point : intersections[0]?.point;
  }
  return undefined;
}

function routeLength(points: readonly CrossingPoint[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
  }
  return total;
}

function pointAt(points: readonly CrossingPoint[], distance: number): CrossingPoint {
  let remaining = distance;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length || index === points.length - 2) {
      const ratio = length === 0 ? 0 : Math.max(0, Math.min(1, remaining / length));
      return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
    }
    remaining -= length;
  }
  return points[points.length - 1] ?? { x: 0, y: 0 };
}

function overlaps(a: CrossingRect, b: CrossingRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function labelPlacement(point: CrossingPoint, label: string, points: readonly CrossingPoint[], blockers: readonly CrossingRect[]): { point: CrossingPoint; box: CrossingRect } {
  const width = Math.max(88, label.length * 6.4 + 18);
  const height = 22;
  const horizontal = points.some((a, index) => {
    const b = points[index + 1];
    return b !== undefined && point.x >= Math.min(a.x, b.x) - EPSILON && point.x <= Math.max(a.x, b.x) + EPSILON
      && point.y >= Math.min(a.y, b.y) - EPSILON && point.y <= Math.max(a.y, b.y) + EPSILON
      && Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  });
  const clearance = horizontal ? height / 2 + 12 : width / 2 + 12;
  for (const offset of [clearance, -clearance, clearance + 16, -(clearance + 16), clearance + 32, -(clearance + 32)]) {
    const center = horizontal ? { x: point.x, y: point.y + offset } : { x: point.x + offset, y: point.y };
    const box = { id: "", x: center.x - width / 2, y: center.y - height / 2, w: width, h: height };
    if (!blockers.some((blocker) => overlaps(box, blocker))) return { point: center, box };
  }
  const center = horizontal
    ? { x: point.x, y: point.y + clearance + 48 }
    : { x: point.x + clearance + 48, y: point.y };
  return { point: center, box: { id: "", x: center.x - width / 2, y: center.y - height / 2, w: width, h: height } };
}

/** Project semantic crossings onto the final routed geometry used by the SVG. */
export function buildCrossingVisuals(input: CrossingVisualInput): CrossingVisual[] {
  const containers = new Map(input.containers.map((container) => [container.id, container]));
  const crossingsByEdge = new Map<string, Crossing[]>();
  for (const crossing of input.crossings) {
    const entries = crossingsByEdge.get(crossing.edgeId) ?? [];
    entries.push(crossing);
    crossingsByEdge.set(crossing.edgeId, entries);
  }
  const occupied = [...(input.blockers ?? [])];
  const visuals: CrossingVisual[] = [];
  for (const [edgeId, entries] of crossingsByEdge) {
    const points = input.edgePoints.get(edgeId);
    if (!points || points.length < 2) continue;
    const sorted = entries.slice().sort((a, b) => a.sequence - b.sequence);
    const total = routeLength(points);
    for (let index = 0; index < sorted.length; index += 1) {
      const crossing = sorted[index];
      const container = containers.get(crossing.boundaryId);
      if (!container) continue;
      const visibleBoundary = input.visibleContainerIds.has(container.id) && input.containerBoxes.has(container.id);
      const point = visibleBoundary
        ? visibleIntersection(points, input.containerBoxes.get(container.id)!, crossing.direction)
        : pointAt(points, total * ((index + 1) / (sorted.length + 1)));
      if (!point) continue;
      const label = `${container.label ?? container.id} ${crossing.direction.toUpperCase()}${crossing.roles.length ? ` - ${crossing.roles.join("/")}` : ""}`;
      const placed = labelPlacement(point, label, points, occupied);
      occupied.push(placed.box);
      visuals.push({ id: crossing.id, edgeId, boundaryId: crossing.boundaryId, boundaryLabel: container.label ?? container.id, direction: crossing.direction, roles: crossing.roles, point, labelPoint: placed.point, labelBox: placed.box, visibleBoundary });
    }
  }
  return visuals;
}
