/**
 * Pure mapping from the 2D LayoutResult to 3D world coordinates. No three.js
 * here, so it's unit-testable headlessly.
 *
 * Axis convention (a "layered cake"):
 *   - The 2D layout (x, y) becomes the ground plane (X, Z), centered at origin.
 *   - The semantic layer depth `z` (§10) becomes height (Y): client low, data
 *     high. Both pieces of information are used — flow on the ground, layer as
 *     elevation — which is exactly why the layout engine carries `z`.
 */

import type { LayoutResult } from "../layout.js";

export interface Scene3DNode {
  id: string;
  label: string;
  /** Box center in world space. */
  x: number;
  y: number;
  z: number;
  /** Box dimensions in world space. */
  w: number;
  h: number;
  d: number;
  /** Layer depth index (0..), for coloring. */
  layer: number;
}

export interface Scene3DEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  a: { x: number; y: number; z: number };
  b: { x: number; y: number; z: number };
}

export interface Scene3DZone {
  id: string;
  label?: string;
  /** Volume center. */
  x: number;
  y: number;
  z: number;
  /** Volume dimensions (h spans the member layer heights). */
  w: number;
  h: number;
  d: number;
  /** Label anchor, offset toward a corner to reduce top/front view collisions. */
  labelX: number;
  labelY: number;
  labelZ: number;
}

export interface Scene3D {
  nodes: Scene3DNode[];
  edges: Scene3DEdge[];
  zones: Scene3DZone[];
  /** Axis-aligned bounds, for camera framing. */
  bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
}

export interface Scene3DOptions {
  /** Scale applied to 2D pixel coordinates. */
  scale?: number;
  /** World height between adjacent layers. */
  layerHeight?: number;
  /** World thickness of node boxes. */
  nodeThickness?: number;
  /**
   * Stack view already expresses layers through the 2D band layout. When this
   * is true, avoid duplicating semantic layer depth as vertical displacement.
   */
  flattenLayerHeight?: boolean;
}

export function buildScene3D(layout: LayoutResult, options: Scene3DOptions = {}): Scene3D {
  const scale = options.scale ?? 0.02;
  const layerHeight = options.layerHeight ?? 1.5;
  const thickness = options.nodeThickness ?? 0.6;
  const flattenLayerHeight = options.flattenLayerHeight ?? false;

  // Center the ground plane on the origin.
  const cx = layout.width / 2;
  const cy = layout.height / 2;
  const X = (px: number) => (px - cx) * scale;
  const Z = (py: number) => (py - cy) * scale;

  const center = new Map<string, { x: number; y: number; z: number }>();
  const nodes: Scene3DNode[] = layout.nodes.map((n) => {
    const x = X(n.x + n.w / 2);
    const y = flattenLayerHeight ? 0 : n.z * layerHeight;
    const z = Z(n.y + n.h / 2);
    center.set(n.id, { x, y, z });
    return { id: n.id, label: n.label, x, y, z, w: n.w * scale, h: thickness, d: n.h * scale, layer: n.z };
  });

  const edges: Scene3DEdge[] = layout.edges
    .filter((e) => center.has(e.from) && center.has(e.to))
    .map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label, a: center.get(e.from)!, b: center.get(e.to)! }));

  // Zones become translucent volumes that span their members' layer heights.
  const ZONE_PAD_Y = 0.6;
  const zones: Scene3DZone[] = layout.zones.map((zn, index) => {
    const ys = zn.nodeIds.map((id) => center.get(id)?.y).filter((v): v is number => v !== undefined);
    const yMin = ys.length ? Math.min(...ys) : 0;
    const yMax = ys.length ? Math.max(...ys) : 0;
    const top = yMax + thickness / 2 + ZONE_PAD_Y;
    const bot = yMin - thickness / 2 - ZONE_PAD_Y;
    const depth = zn.depth ?? 0;
    const lane = index % 4;
    return {
      id: zn.id,
      label: zn.label,
      x: X(zn.x + zn.w / 2),
      y: (top + bot) / 2,
      z: Z(zn.y + zn.h / 2),
      w: zn.w * scale,
      h: top - bot,
      d: zn.h * scale,
      labelX: X(zn.x + 18 + depth * 18),
      labelY: top + 0.55 + depth * 0.35 + lane * 0.06,
      labelZ: Z(zn.y + 18 + depth * 18 + lane * 10),
    };
  });

  // Bounds across nodes (incl. their height).
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const zs = nodes.map((n) => n.z);
  const bounds = {
    min: { x: Math.min(0, ...xs), y: Math.min(0, ...ys), z: Math.min(0, ...zs) },
    max: { x: Math.max(0, ...xs), y: Math.max(0, ...ys), z: Math.max(0, ...zs) },
  };

  return { nodes, edges, zones, bounds };
}
