import { diagnostic } from "./diagnostics.js";
import type { ArchEdge, ArchNode, Boundary, Diagnostic, Zone } from "./types.js";
import type {
  ContainerBoundary,
  OverlayBoundary,
  OverlayMember,
  Resource,
  TopologyEdge,
  TopologyModel,
} from "./topology.js";

type Dict = Record<string, unknown>;

function object(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function texts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function extensions(value: unknown): Record<string, unknown> | undefined {
  return object(value) ? { ...value } : undefined;
}

function parent(value: unknown): string | null {
  return value === null ? null : text(value) ?? null;
}

function entries(value: unknown): Array<[string, Dict]> {
  if (!object(value)) return [];
  return Object.entries(value).flatMap(([id, body]) => object(body) ? [[id, body]] : []);
}

function overlayMember(value: unknown): OverlayMember | undefined {
  if (!object(value)) return undefined;
  const type = text(value.type);
  const id = text(value.id);
  if ((type === "resource" || type === "container" || type === "overlay") && id) return { type, id };
  for (const candidate of ["resource", "container", "overlay"] as const) {
    const shorthand = text(value[candidate]);
    if (shorthand) return { type: candidate, id: shorthand };
  }
  return undefined;
}

export interface ParsedTopologySection {
  topology?: TopologyModel;
  diagnostics: Diagnostic[];
}

/** Parse the canonical ArchMap Next `topology:` YAML section. */
export function parseTopologySection(value: unknown): ParsedTopologySection {
  if (value === undefined) return { diagnostics: [] };
  if (!object(value)) {
    return { diagnostics: [diagnostic("topology_invalid", "topology must be a mapping.", { type: "view", id: "topology" }, "error")] };
  }
  const diagnostics: Diagnostic[] = [];
  for (const derived of ["analysis", "crossings", "overlayTransitions"] as const) {
    if (value[derived] !== undefined) {
      diagnostics.push(diagnostic(
        "topology_derived_input_forbidden",
        `topology.${derived} is derived output and cannot be authored. The value was ignored.`,
        { type: "view", id: `topology.${derived}` },
        "error",
      ));
    }
  }

  const resources: Resource[] = entries(value.resources).map(([id, body]) => ({
    id,
    label: text(body.label),
    kind: text(body.kind),
    parent: parent(body.parent),
    note: text(body.note),
    extensions: extensions(body.extensions),
  }));
  const containers: ContainerBoundary[] = entries(value.containers).map(([id, body]) => ({
    id,
    label: text(body.label),
    kind: text(body.kind),
    roles: texts(body.roles),
    parent: parent(body.parent),
    enforcedBy: texts(body.enforcedBy),
    note: text(body.note),
    extensions: extensions(body.extensions),
  }));
  const overlays: OverlayBoundary[] = entries(value.overlays).map(([id, body]) => {
    const members = Array.isArray(body.members)
      ? body.members.flatMap((entry) => {
        const parsed = overlayMember(entry);
        if (!parsed) diagnostics.push(diagnostic("topology_overlay_member_invalid", `Overlay "${id}" has an invalid member. Use { resource }, { container }, { overlay }, or { type, id }.`, { type: "overlay", id }, "error"));
        return parsed ? [parsed] : [];
      })
      : [];
    const render = text(body.render);
    if (render && render !== "outline" && render !== "highlight" && render !== "badge") {
      diagnostics.push(diagnostic("topology_overlay_render_invalid", `Overlay "${id}" uses unsupported render hint "${render}".`, { type: "overlay", id }, "warning"));
    }
    return {
      id,
      label: text(body.label),
      kind: text(body.kind),
      roles: texts(body.roles),
      members,
      render: render === "outline" || render === "highlight" || render === "badge" ? render : undefined,
      note: text(body.note),
      extensions: extensions(body.extensions),
    };
  });
  const edges: TopologyEdge[] = entries(value.edges).flatMap(([id, body]) => {
    const from = text(body.from);
    const to = text(body.to);
    if (!from || !to) {
      diagnostics.push(diagnostic("topology_edge_incomplete", `Topology Edge "${id}" must declare Resource endpoints from and to.`, { type: "edge", id }, "error"));
      return [];
    }
    const direction = text(body.direction);
    if (direction && direction !== "directed" && direction !== "bidirectional") {
      diagnostics.push(diagnostic("topology_edge_direction_invalid", `Topology Edge "${id}" uses unsupported direction "${direction}".`, { type: "edge", id }, "error"));
    }
    const port = typeof body.port === "number" || typeof body.port === "string" ? body.port : undefined;
    return [{
      id,
      from,
      to,
      direction: direction === "bidirectional" ? "bidirectional" : "directed",
      protocol: text(body.protocol),
      port,
      note: text(body.note),
      extensions: extensions(body.extensions),
    }];
  });

  if (resources.length === 0) diagnostics.push(diagnostic("topology_resources_empty", "topology.resources declares no Resources.", { type: "view", id: "topology.resources" }, "warning"));
  return { topology: { resources, containers, overlays, edges }, diagnostics };
}

/** Project native facts into the released model so existing renderers remain usable. */
export function projectTopologyCompatibility(
  topology: TopologyModel,
  nodes: ArchNode[],
  edges: ArchEdge[],
  zones: Zone[],
  boundaries: Boundary[],
): void {
  const nodeById = new Map(nodes.map((entry) => [entry.id, entry]));
  for (const resource of topology.resources) {
    const existing = nodeById.get(resource.id);
    if (existing) {
      existing.label = resource.label ?? existing.label;
      existing.kind = resource.kind ?? existing.kind;
      existing.zone = resource.parent ?? existing.zone;
      existing.description = resource.note ?? existing.description;
      continue;
    }
    const node: ArchNode = {
      id: resource.id,
      label: resource.label ?? resource.id,
      shape: resource.kind?.includes("database") ? "database" : "rectangle",
      zone: resource.parent ?? undefined,
      kind: resource.kind,
      description: resource.note,
    };
    nodes.push(node);
    nodeById.set(node.id, node);
  }
  const zoneIds = new Set(zones.map((entry) => entry.id));
  for (const container of topology.containers) {
    if (zoneIds.has(container.id)) continue;
    // Provider-specific kinds remain canonical Topology facts. The compatibility
    // projection deliberately omits them because the legacy Zone vocabulary is
    // a presentation surface, not a cloud-containment validator.
    zones.push({ id: container.id, label: container.label, parent: container.parent ?? undefined, description: container.note });
    zoneIds.add(container.id);
  }
  const boundaryIds = new Set(boundaries.map((entry) => entry.id));
  for (const overlay of topology.overlays) {
    if (boundaryIds.has(overlay.id)) continue;
    boundaries.push({ id: overlay.id, label: overlay.label, contains: overlay.members.map((member) => member.id), description: overlay.note });
    boundaryIds.add(overlay.id);
  }
  const edgeIds = new Set(edges.map((entry) => entry.id));
  for (const edge of topology.edges) {
    if (edgeIds.has(edge.id)) continue;
    edges.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      pairKey: `${edge.from}->${edge.to}`,
      source: "metadata",
      protocol: edge.protocol,
      direction: edge.direction === "bidirectional" ? "two_way" : "one_way",
      description: edge.note,
    });
    edgeIds.add(edge.id);
  }
}
