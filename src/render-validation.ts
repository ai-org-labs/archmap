export interface RenderValidationOptions {
  minPortGap?: number;
  minEndpointStub?: number;
  overlapThreshold?: number;
  componentPadding?: number;
  tolerance?: number;
}

export interface RenderValidationFailure {
  kind: "exact-endpoint-overlap" | "port-gap" | "segment-overlap" | "component-intersection" | "endpoint-incidence" | "missing-node";
  message: string;
  edgeIds: string[];
  nodeId?: string;
  side?: "left" | "right" | "top" | "bottom";
  value?: number;
  overlap?: number;
}

interface Point {
  x: number;
  y: number;
}

interface NodeBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EdgePath {
  id: string;
  from: string;
  to: string;
  points: Point[];
  segments: Segment[];
  reciprocalKey: string;
}

interface Endpoint {
  edgeId: string;
  nodeId: string;
  otherNodeId: string;
  point: Point;
  side: "left" | "right" | "top" | "bottom";
  axisValue: number;
  reciprocalKey: string;
}

interface Segment {
  edgeId: string;
  orient: "h" | "v";
  lane: number;
  start: number;
  end: number;
}

const DEFAULT_MIN_PORT_GAP = 6;
const DEFAULT_MIN_ENDPOINT_STUB = 10;
const DEFAULT_OVERLAP_THRESHOLD = 8;
const DEFAULT_COMPONENT_PADDING = 4;
const DEFAULT_TOLERANCE = 0.5;

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function attr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : undefined;
}

function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function pointsFromPath(d: string): Point[] {
  return [...d.matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)]
    .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function segmentsFromPath(d: string, edgeId: string, tolerance: number): Segment[] {
  const segments: Segment[] = [];
  let previous: Point | undefined;
  for (const match of d.matchAll(/([ML])\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)) {
    const command = match[1];
    const point = { x: Number(match[2]), y: Number(match[3]) };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if (command === "L" && previous) {
      if (Math.abs(previous.y - point.y) <= tolerance && Math.abs(previous.x - point.x) > tolerance) {
        segments.push({
          edgeId,
          orient: "h",
          lane: previous.y,
          start: Math.min(previous.x, point.x),
          end: Math.max(previous.x, point.x),
        });
      } else if (Math.abs(previous.x - point.x) <= tolerance && Math.abs(previous.y - point.y) > tolerance) {
        segments.push({
          edgeId,
          orient: "v",
          lane: previous.x,
          start: Math.min(previous.y, point.y),
          end: Math.max(previous.y, point.y),
        });
      }
    }
    previous = point;
  }
  return segments;
}

function parseNodes(svg: string): Map<string, NodeBox> {
  const nodes = new Map<string, NodeBox>();
  for (const match of svg.matchAll(/<g class="archmap-node[^"]*"([^>]*)>/g)) {
    const attrs = match[1];
    const id = attr(attrs, "data-id");
    const x = num(attr(attrs, "data-x"));
    const y = num(attr(attrs, "data-y"));
    const w = num(attr(attrs, "data-w"));
    const h = num(attr(attrs, "data-h"));
    if (id && x !== undefined && y !== undefined && w !== undefined && h !== undefined) {
      nodes.set(id, { id, x, y, w, h });
    }
  }
  return nodes;
}

function parseEdges(svg: string, tolerance: number): EdgePath[] {
  const edges: EdgePath[] = [];
  const edgeGroup = /<g class="[^"]*(?:archmap-edge|archmap-overlay-edge)[^"]*"([^>]*)>([\s\S]*?)<\/g>/g;
  for (const match of svg.matchAll(edgeGroup)) {
    const attrs = match[1];
    const id = attr(attrs, "data-id");
    const from = attr(attrs, "data-from");
    const to = attr(attrs, "data-to");
    const path = match[2].match(/<path class="archmap-edge-path" d="([^"]*)"/);
    if (!id || !from || !to || !path) continue;
    const points = pointsFromPath(decodeXml(path[1]));
    if (points.length < 2) continue;
    const segments = segmentsFromPath(decodeXml(path[1]), id, tolerance);
    const reciprocalKey = from < to ? `${from}\t${to}` : `${to}\t${from}`;
    edges.push({ id, from, to, points, segments, reciprocalKey });
  }
  return edges;
}

function endpointSide(node: NodeBox, point: Point): Endpoint["side"] {
  const distances = [
    { side: "left" as const, distance: Math.abs(point.x - node.x) },
    { side: "right" as const, distance: Math.abs(point.x - (node.x + node.w)) },
    { side: "top" as const, distance: Math.abs(point.y - node.y) },
    { side: "bottom" as const, distance: Math.abs(point.y - (node.y + node.h)) },
  ];
  return distances.sort((a, b) => a.distance - b.distance)[0].side;
}

function endpointAxisValue(side: Endpoint["side"], point: Point): number {
  return side === "left" || side === "right" ? point.y : point.x;
}

function endpointsFor(edges: EdgePath[], nodes: Map<string, NodeBox>, failures: RenderValidationFailure[]): Endpoint[] {
  const endpoints: Endpoint[] = [];
  for (const edge of edges) {
    const source = nodes.get(edge.from);
    const target = nodes.get(edge.to);
    if (!source || !target) {
      failures.push({
        kind: "missing-node",
        message: `Edge "${edge.id}" references a node that was not rendered.`,
        edgeIds: [edge.id],
        nodeId: !source ? edge.from : edge.to,
      });
      continue;
    }
    const start = edge.points[0];
    const end = edge.points[edge.points.length - 1];
    const startSide = endpointSide(source, start);
    const endSide = endpointSide(target, end);
    endpoints.push({
      edgeId: edge.id,
      nodeId: edge.from,
      otherNodeId: edge.to,
      point: start,
      side: startSide,
      axisValue: endpointAxisValue(startSide, start),
      reciprocalKey: edge.reciprocalKey,
    });
    endpoints.push({
      edgeId: edge.id,
      nodeId: edge.to,
      otherNodeId: edge.from,
      point: end,
      side: endSide,
      axisValue: endpointAxisValue(endSide, end),
      reciprocalKey: edge.reciprocalKey,
    });
  }
  return endpoints;
}

function samePoint(a: Point, b: Point, tolerance: number): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

function intentionallyTrackedReciprocal(a: Endpoint, b: Endpoint): boolean {
  return a.reciprocalKey === b.reciprocalKey && a.otherNodeId === b.otherNodeId && a.edgeId !== b.edgeId;
}

function validateEndpointPlacement(endpoints: Endpoint[], minPortGap: number, tolerance: number): RenderValidationFailure[] {
  const failures: RenderValidationFailure[] = [];
  const byNode = new Map<string, Endpoint[]>();
  for (const endpoint of endpoints) {
    (byNode.get(endpoint.nodeId) ?? (byNode.set(endpoint.nodeId, []), byNode.get(endpoint.nodeId)!)).push(endpoint);
  }

  for (const [nodeId, entries] of byNode) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        if (samePoint(a.point, b.point, tolerance) && !intentionallyTrackedReciprocal(a, b)) {
          failures.push({
            kind: "exact-endpoint-overlap",
            message: `Node "${nodeId}" has overlapping endpoints for "${a.edgeId}" and "${b.edgeId}".`,
            edgeIds: [a.edgeId, b.edgeId],
            nodeId,
            side: a.side === b.side ? a.side : undefined,
          });
        }
      }
    }

    const bySide = new Map<Endpoint["side"], Endpoint[]>();
    for (const endpoint of entries) {
      (bySide.get(endpoint.side) ?? (bySide.set(endpoint.side, []), bySide.get(endpoint.side)!)).push(endpoint);
    }
    for (const [side, sideEntries] of bySide) {
      sideEntries.sort((a, b) => a.axisValue - b.axisValue || a.edgeId.localeCompare(b.edgeId));
      for (let i = 1; i < sideEntries.length; i++) {
        const prev = sideEntries[i - 1];
        const next = sideEntries[i];
        const gap = Math.abs(next.axisValue - prev.axisValue);
        if (gap + tolerance < minPortGap && !intentionallyTrackedReciprocal(prev, next)) {
          failures.push({
            kind: "port-gap",
            message: `Node "${nodeId}" has endpoints on ${side} closer than ${minPortGap}px.`,
            edgeIds: [prev.edgeId, next.edgeId],
            nodeId,
            side,
            value: gap,
          });
        }
      }
    }
  }
  return failures;
}

function validateSegmentOverlap(edges: EdgePath[], overlapThreshold: number, tolerance: number): RenderValidationFailure[] {
  const failures: RenderValidationFailure[] = [];
  const segments = edges.flatMap((edge) => edge.segments);
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i];
      const b = segments[j];
      if (a.edgeId === b.edgeId || a.orient !== b.orient || Math.abs(a.lane - b.lane) > tolerance) continue;
      const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
      if (overlap > overlapThreshold) {
        failures.push({
          kind: "segment-overlap",
          message: `Edges "${a.edgeId}" and "${b.edgeId}" overlap for ${overlap.toFixed(1)}px.`,
          edgeIds: [a.edgeId, b.edgeId],
          overlap,
        });
      }
    }
  }
  return failures;
}

function pointInsideNodeRegion(node: NodeBox, point: Point, padding: number): boolean {
  return (
    point.x > node.x - padding &&
    point.x < node.x + node.w + padding &&
    point.y > node.y - padding &&
    point.y < node.y + node.h + padding
  );
}

function validateComponentIntersections(edges: EdgePath[], nodes: Map<string, NodeBox>, padding: number): RenderValidationFailure[] {
  const failures: RenderValidationFailure[] = [];
  for (const edge of edges) {
    for (const segment of edge.segments) {
      const length = segment.end - segment.start;
      const steps = Math.max(2, Math.ceil(length / 6));
      for (const node of nodes.values()) {
        if (node.id === edge.from || node.id === edge.to) continue;
        let hit = false;
        for (let step = 1; step < steps; step++) {
          const t = step / steps;
          const point = segment.orient === "h"
            ? { x: segment.start + length * t, y: segment.lane }
            : { x: segment.lane, y: segment.start + length * t };
          if (pointInsideNodeRegion(node, point, padding)) {
            hit = true;
            break;
          }
        }
        if (hit) {
          failures.push({
            kind: "component-intersection",
            message: `Edge "${edge.id}" passes through component region "${node.id}".`,
            edgeIds: [edge.id],
            nodeId: node.id,
          });
        }
      }
    }
  }
  return failures;
}

function isPerpendicularToSide(side: Endpoint["side"], endpoint: Point, adjacent: Point, tolerance: number): boolean {
  if (side === "left" || side === "right") return Math.abs(endpoint.y - adjacent.y) <= tolerance;
  return Math.abs(endpoint.x - adjacent.x) <= tolerance;
}

function segmentLength(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function exitsOutwardFromSide(side: Endpoint["side"], endpoint: Point, adjacent: Point, tolerance: number): boolean {
  if (side === "left") return adjacent.x <= endpoint.x + tolerance;
  if (side === "right") return adjacent.x >= endpoint.x - tolerance;
  if (side === "top") return adjacent.y <= endpoint.y + tolerance;
  return adjacent.y >= endpoint.y - tolerance;
}

function validateEndpointIncidence(
  edges: EdgePath[],
  nodes: Map<string, NodeBox>,
  tolerance: number,
  minEndpointStub: number,
): RenderValidationFailure[] {
  const failures: RenderValidationFailure[] = [];
  for (const edge of edges) {
    const source = nodes.get(edge.from);
    const target = nodes.get(edge.to);
    if (!source || !target || edge.points.length < 2) continue;
    const start = edge.points[0];
    const startAdjacent = edge.points[1];
    const startSide = endpointSide(source, start);
    const startLength = segmentLength(start, startAdjacent);
    if (
      !isPerpendicularToSide(startSide, start, startAdjacent, tolerance) ||
      !exitsOutwardFromSide(startSide, start, startAdjacent, tolerance) ||
      startLength + tolerance < minEndpointStub
    ) {
      failures.push({
        kind: "endpoint-incidence",
        message: `Edge "${edge.id}" does not leave source "${edge.from}" perpendicular and outward from its ${startSide} side.`,
        edgeIds: [edge.id],
        nodeId: edge.from,
        side: startSide,
        value: startLength,
      });
    }
    const end = edge.points[edge.points.length - 1];
    const endAdjacent = edge.points[edge.points.length - 2];
    const endSide = endpointSide(target, end);
    const endLength = segmentLength(end, endAdjacent);
    if (
      !isPerpendicularToSide(endSide, end, endAdjacent, tolerance) ||
      !exitsOutwardFromSide(endSide, end, endAdjacent, tolerance) ||
      endLength + tolerance < minEndpointStub
    ) {
      failures.push({
        kind: "endpoint-incidence",
        message: `Edge "${edge.id}" does not enter target "${edge.to}" perpendicular and outward from its ${endSide} side.`,
        edgeIds: [edge.id],
        nodeId: edge.to,
        side: endSide,
        value: endLength,
      });
    }
  }
  return failures;
}

export function validateRenderedSvgPorts(svg: string, options: RenderValidationOptions = {}): RenderValidationFailure[] {
  const minPortGap = options.minPortGap ?? DEFAULT_MIN_PORT_GAP;
  const minEndpointStub = options.minEndpointStub ?? DEFAULT_MIN_ENDPOINT_STUB;
  const overlapThreshold = options.overlapThreshold ?? DEFAULT_OVERLAP_THRESHOLD;
  const componentPadding = options.componentPadding ?? DEFAULT_COMPONENT_PADDING;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const failures: RenderValidationFailure[] = [];
  const nodes = parseNodes(svg);
  const edges = parseEdges(svg, tolerance);
  const endpoints = endpointsFor(edges, nodes, failures);
  failures.push(...validateEndpointPlacement(endpoints, minPortGap, tolerance));
  failures.push(...validateSegmentOverlap(edges, overlapThreshold, tolerance));
  failures.push(...validateComponentIntersections(edges, nodes, componentPadding));
  failures.push(...validateEndpointIncidence(edges, nodes, tolerance, minEndpointStub));
  return failures;
}
