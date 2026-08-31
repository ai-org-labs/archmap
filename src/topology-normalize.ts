import type { ArchEdge, ArchMapModel, Boundary, Zone } from "./types.js";
import type {
  ContainerBoundary,
  LegacyTopologyElementType,
  OverlayBoundary,
  OverlayMember,
  Resource,
  TopologyEdge,
  TopologyExtensions,
  TopologyModel,
  TopologyProvenance,
} from "./topology.js";

export type LegacyCrossingExpectation = "crossing" | "no-crossing" | "specific-boundaries";

/** Compatibility-only claim to compare with derived crossings after analysis. */
export interface LegacyBoundaryCrossingAssertion {
  edgeId: string;
  expectation: LegacyCrossingExpectation;
  boundaryIds: string[];
  reviewed: boolean;
  provenance: TopologyProvenance;
}

export type TopologyNormalizationDiagnosticLevel = "info" | "warning";
export type TopologyNormalizationDiagnosticCode =
  | "legacy_topology_normalized"
  | "legacy_resource_parent_unknown"
  | "legacy_container_parent_unknown"
  | "legacy_container_multiple_parents"
  | "legacy_overlay_member_unknown"
  | "legacy_edge_endpoint_unknown"
  | "legacy_boundary_crossing_assertion_preserved";

export interface TopologyNormalizationDiagnostic {
  level: TopologyNormalizationDiagnosticLevel;
  code: TopologyNormalizationDiagnosticCode;
  message: string;
  source?: TopologyProvenance;
}

export interface TopologyNormalizationResult {
  topology: TopologyModel;
  legacyAssertions: LegacyBoundaryCrossingAssertion[];
  diagnostics: TopologyNormalizationDiagnostic[];
}

function provenance(type: LegacyTopologyElementType, id: string): TopologyProvenance {
  return { source: "legacy", type, id };
}

function compactExtensions(values: TopologyExtensions): TopologyExtensions | undefined {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeResource(model: ArchMapModel, zoneIds: Set<string>, diagnostics: TopologyNormalizationDiagnostic[]): Resource[] {
  return model.nodes.map((node) => {
    const source = provenance("node", node.id);
    const requestedParent = node.resolvedZone ?? node.zone ?? null;
    const parent = requestedParent !== null && zoneIds.has(requestedParent) ? requestedParent : null;
    if (requestedParent !== null && parent === null) {
      diagnostics.push({
        level: "warning",
        code: "legacy_resource_parent_unknown",
        message: `Resource "${node.id}" references unknown legacy zone "${requestedParent}"; parent was normalized to null.`,
        source,
      });
    }
    return {
      id: node.id,
      label: node.label,
      kind: node.kind,
      parent,
      note: node.description,
      extensions: compactExtensions({
        "archmap.legacy.shape": node.shape,
        "archmap.legacy.layer": node.layer,
        "archmap.legacy.provider": node.provider,
        "archmap.legacy.principal": node.principal,
        "archmap.legacy.tags": node.tags,
        "archmap.legacy.placement": node.placement,
      }),
      provenance: [source],
    };
  });
}

function normalizeContainers(zones: Zone[], zoneIds: Set<string>, diagnostics: TopologyNormalizationDiagnostic[]): ContainerBoundary[] {
  const inferredParents = new Map<string, string[]>();
  for (const candidateParent of zones) {
    for (const child of candidateParent.resolvedContains ?? []) {
      if (child.type !== "zone") continue;
      const parents = inferredParents.get(child.id) ?? [];
      parents.push(candidateParent.id);
      inferredParents.set(child.id, parents);
    }
  }

  return zones.map((zone) => {
    const source = provenance("zone", zone.id);
    const candidates = inferredParents.get(zone.id) ?? [];
    const requestedParent = zone.parent ?? candidates[0] ?? null;
    if (!zone.parent && candidates.length > 1) {
      diagnostics.push({
        level: "warning",
        code: "legacy_container_multiple_parents",
        message: `Container "${zone.id}" appears in multiple legacy zones (${candidates.join(", ")}); "${candidates[0]}" was selected as its direct parent.`,
        source,
      });
    }
    const parent = requestedParent !== null && zoneIds.has(requestedParent) ? requestedParent : null;
    if (requestedParent !== null && parent === null) {
      diagnostics.push({
        level: "warning",
        code: "legacy_container_parent_unknown",
        message: `Container "${zone.id}" references unknown legacy parent zone "${requestedParent}"; parent was normalized to null.`,
        source,
      });
    }
    return {
      id: zone.id,
      label: zone.label,
      kind: zone.kind,
      roles: [],
      parent,
      note: zone.description,
      extensions: compactExtensions({
        "archmap.legacy.provider": zone.provider,
        "archmap.legacy.trustLevel": zone.trustLevel,
        "archmap.legacy.owner": zone.owner,
      }),
      provenance: [source],
    };
  });
}

function resolveOverlayMembers(
  boundary: Boundary,
  resourceIds: Set<string>,
  containerIds: Set<string>,
  overlayIds: Set<string>,
  diagnostics: TopologyNormalizationDiagnostic[],
): OverlayMember[] {
  const source = provenance("boundary", boundary.id);
  const authored = boundary.resolvedContains ?? (boundary.contains ?? []).map((id) => {
    if (resourceIds.has(id)) return { type: "node" as const, id };
    if (containerIds.has(id)) return { type: "zone" as const, id };
    return { type: "boundary" as const, id };
  });
  const members: OverlayMember[] = [];
  const seen = new Set<string>();

  for (const member of authored) {
    const normalizedType = member.type === "node" ? "resource" : member.type === "zone" ? "container" : "overlay";
    const known = normalizedType === "resource"
      ? resourceIds.has(member.id)
      : normalizedType === "container"
        ? containerIds.has(member.id)
        : overlayIds.has(member.id);
    if (!known) {
      diagnostics.push({
        level: "warning",
        code: "legacy_overlay_member_unknown",
        message: `Overlay "${boundary.id}" references unknown ${normalizedType} "${member.id}"; the member was omitted.`,
        source,
      });
      continue;
    }
    const key = `${normalizedType}:${member.id}`;
    if (!seen.has(key)) {
      members.push({ type: normalizedType, id: member.id });
      seen.add(key);
    }
  }
  return members;
}

function normalizeOverlays(
  boundaries: Boundary[],
  resourceIds: Set<string>,
  containerIds: Set<string>,
  diagnostics: TopologyNormalizationDiagnostic[],
): OverlayBoundary[] {
  const overlayIds = new Set(boundaries.map((boundary) => boundary.id));
  return boundaries.map((boundary) => {
    const source = provenance("boundary", boundary.id);
    return {
      id: boundary.id,
      label: boundary.label,
      kind: boundary.kind,
      members: resolveOverlayMembers(boundary, resourceIds, containerIds, overlayIds, diagnostics),
      note: boundary.description,
      extensions: compactExtensions({ "archmap.legacy.zone": boundary.zone }),
      provenance: [source],
    };
  });
}

function legacyAssertion(edge: ArchEdge): LegacyBoundaryCrossingAssertion | undefined {
  const crossing = edge.boundaryCrossing;
  if (!crossing) return undefined;
  const expectation: LegacyCrossingExpectation = crossing.assertedFalse
    ? "no-crossing"
    : crossing.crosses.length > 0
      ? "specific-boundaries"
      : "crossing";
  return {
    edgeId: edge.id,
    expectation,
    boundaryIds: crossing.crosses.slice(),
    reviewed: crossing.reviewed,
    provenance: provenance("edge", edge.id),
  };
}

function normalizeEdges(
  edges: ArchEdge[],
  resourceIds: Set<string>,
  diagnostics: TopologyNormalizationDiagnostic[],
  assertions: LegacyBoundaryCrossingAssertion[],
): TopologyEdge[] {
  const normalized: TopologyEdge[] = [];
  for (const edge of edges) {
    const source = provenance("edge", edge.id);
    const assertion = legacyAssertion(edge);
    if (assertion) {
      assertions.push(assertion);
      diagnostics.push({
        level: "info",
        code: "legacy_boundary_crossing_assertion_preserved",
        message: `Legacy boundaryCrossing on edge "${edge.id}" was preserved as a compatibility assertion, not canonical topology truth.`,
        source,
      });
    }
    if (!resourceIds.has(edge.from) || !resourceIds.has(edge.to)) {
      diagnostics.push({
        level: "warning",
        code: "legacy_edge_endpoint_unknown",
        message: `Edge "${edge.id}" does not connect two known Resources and was omitted from canonical topology.`,
        source,
      });
      continue;
    }
    normalized.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      direction: edge.direction === "two_way" || edge.direction === "request_response" ? "bidirectional" : "directed",
      protocol: edge.protocol,
      note: edge.description,
      extensions: compactExtensions({
        "archmap.legacy.label": edge.label,
        "archmap.legacy.graphLabel": edge.graphLabel,
        "archmap.legacy.flow": edge.flow,
        "archmap.legacy.source": edge.source,
        "archmap.legacy.auth": edge.auth,
        "archmap.legacy.principal": edge.principal,
        "archmap.legacy.dataIds": edge.dataIds,
        "archmap.legacy.networkPath": edge.networkPath,
        "archmap.legacy.trigger": edge.trigger,
        "archmap.legacy.tags": edge.tags,
      }),
      provenance: [source],
    });
  }
  return normalized;
}

/**
 * Convert the released ArchMap model into ArchMap Next authored topology.
 *
 * Subgraphs and layers are deliberately excluded from containment. Legacy
 * boundaryCrossing values are returned as assertions for later comparison;
 * they never become derived Crossing records here.
 */
export function normalizeTopology(model: ArchMapModel): TopologyNormalizationResult {
  const diagnostics: TopologyNormalizationDiagnostic[] = [];
  const assertions: LegacyBoundaryCrossingAssertion[] = [];
  const resourceIds = new Set(model.nodes.map((node) => node.id));
  const containerIds = new Set(model.zones.map((zone) => zone.id));

  const topology: TopologyModel = {
    resources: normalizeResource(model, containerIds, diagnostics),
    containers: normalizeContainers(model.zones, containerIds, diagnostics),
    overlays: normalizeOverlays(model.boundaries, resourceIds, containerIds, diagnostics),
    edges: normalizeEdges(model.edges, resourceIds, diagnostics, assertions),
  };

  diagnostics.unshift({
    level: "info",
    code: "legacy_topology_normalized",
    message: `Normalized ${topology.resources.length} Resources, ${topology.containers.length} Containers, ${topology.overlays.length} Overlays, and ${topology.edges.length} direct communication Edges from the released model.`,
  });

  return { topology, legacyAssertions: assertions, diagnostics };
}
