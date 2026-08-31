import { analyzeContainerForest, type ContainerForestDiagnostic } from "./topology-forest.js";
import type { LegacyBoundaryCrossingAssertion } from "./topology-normalize.js";
import {
  createTopologyAnalysis,
  type Crossing,
  type CrossingDirection,
  type OverlayTransition,
  type Resource,
  type TopologyAnalysis,
  type TopologyAnalysisResult,
  type TopologyEdge,
  type TopologyModel,
  type TopologyTraversal,
} from "./topology.js";

export type TopologyDerivationDiagnosticLevel = "error" | "warning";

export type TopologyDerivationDiagnosticCode =
  | "topology_edge_endpoint_unknown"
  | "topology_overlay_member_unknown"
  | "legacy_crossing_assertion_edge_unknown"
  | "legacy_crossing_assertion_mismatch";

export interface TopologyDerivationDiagnostic {
  level: TopologyDerivationDiagnosticLevel;
  code: TopologyDerivationDiagnosticCode;
  message: string;
  target: { type: "edge" | "overlay"; id: string };
  relatedIds?: string[];
}

export interface TopologyDerivationOptions {
  legacyAssertions?: readonly LegacyBoundaryCrossingAssertion[];
}

/** Queryable, deterministic analysis plus diagnostics from its authored facts. */
export interface DerivedTopologyAnalysis extends TopologyAnalysis {
  readonly valid: boolean;
  readonly diagnostics: readonly (ContainerForestDiagnostic | TopologyDerivationDiagnostic)[];
}

function crossingId(
  edgeId: string,
  traversal: TopologyTraversal,
  sequence: number,
): string {
  return `${edgeId}:${traversal}:${sequence}`;
}

function resourceAncestors(
  resource: Resource,
  forest: ReturnType<typeof analyzeContainerForest>,
): string[] {
  if (resource.parent === null || !(resource.parent in forest.containers)) return [];
  return [...forest.ancestors[resource.parent], resource.parent];
}

function commonPrefixLength(source: readonly string[], target: readonly string[]): number {
  const limit = Math.min(source.length, target.length);
  let index = 0;
  while (index < limit && source[index] === target[index]) index += 1;
  return index;
}

function forwardCrossings(
  edge: TopologyEdge,
  source: Resource,
  target: Resource,
  forest: ReturnType<typeof analyzeContainerForest>,
): Crossing[] {
  const sourceChain = resourceAncestors(source, forest);
  const targetChain = resourceAncestors(target, forest);
  const sharedLength = commonPrefixLength(sourceChain, targetChain);
  const ordered = [
    ...sourceChain.slice(sharedLength).reverse().map((boundaryId) => ({
      boundaryId,
      direction: "exit" as const,
    })),
    ...targetChain.slice(sharedLength).map((boundaryId) => ({
      boundaryId,
      direction: "enter" as const,
    })),
  ];

  return ordered.map(({ boundaryId, direction }, sequence) => ({
    id: crossingId(edge.id, "forward", sequence),
    edgeId: edge.id,
    traversal: "forward",
    sequence,
    boundaryId,
    direction,
    roles: forest.containers[boundaryId].roles.slice(),
  }));
}

function inverseCrossings(edgeId: string, forward: readonly Crossing[]): Crossing[] {
  const inverseDirection: Record<CrossingDirection, CrossingDirection> = {
    enter: "exit",
    exit: "enter",
  };
  return forward.slice().reverse().map((crossing, sequence) => ({
    ...crossing,
    id: crossingId(edgeId, "reverse", sequence),
    traversal: "reverse",
    sequence,
    direction: inverseDirection[crossing.direction],
    roles: crossing.roles.slice(),
  }));
}

function explicitResourceOverlays(topology: TopologyModel): Map<string, Set<string>> {
  const membership = new Map(topology.resources.map((resource) => [resource.id, new Set<string>()]));
  for (const overlay of topology.overlays) {
    for (const member of overlay.members) {
      if (member.type === "resource") membership.get(member.id)?.add(overlay.id);
    }
  }
  return membership;
}

function overlayTransition(
  edgeId: string,
  traversal: TopologyTraversal,
  sourceOverlays: ReadonlySet<string>,
  targetOverlays: ReadonlySet<string>,
): OverlayTransition {
  const gained = [...targetOverlays].filter((id) => !sourceOverlays.has(id)).sort();
  const lost = [...sourceOverlays].filter((id) => !targetOverlays.has(id)).sort();
  const shared = [...sourceOverlays].filter((id) => targetOverlays.has(id)).sort();
  return { edgeId, traversal, gained, lost, shared };
}

function sameIds(actual: readonly string[], expected: readonly string[]): boolean {
  return [...new Set(actual)].sort().join("\u0000") === [...new Set(expected)].sort().join("\u0000");
}

function compareLegacyAssertions(
  assertions: readonly LegacyBoundaryCrossingAssertion[],
  edges: ReadonlyMap<string, TopologyEdge>,
  crossings: readonly Crossing[],
): TopologyDerivationDiagnostic[] {
  const diagnostics: TopologyDerivationDiagnostic[] = [];
  for (const assertion of assertions) {
    if (!edges.has(assertion.edgeId)) {
      diagnostics.push({
        level: "warning",
        code: "legacy_crossing_assertion_edge_unknown",
        message: `Legacy crossing assertion references unknown Edge "${assertion.edgeId}".`,
        target: { type: "edge", id: assertion.edgeId },
      });
      continue;
    }
    const derived = crossings
      .filter((crossing) => crossing.edgeId === assertion.edgeId && crossing.traversal === "forward")
      .map((crossing) => crossing.boundaryId);
    const agrees = assertion.expectation === "crossing"
      ? derived.length > 0
      : assertion.expectation === "no-crossing"
        ? derived.length === 0
        : sameIds(derived, assertion.boundaryIds);
    if (agrees) continue;
    const expected = assertion.expectation === "specific-boundaries"
      ? `boundaries [${assertion.boundaryIds.slice().sort().join(", ")}]`
      : assertion.expectation;
    diagnostics.push({
      level: "warning",
      code: "legacy_crossing_assertion_mismatch",
      message: `Legacy assertion for Edge "${assertion.edgeId}" expected ${expected}, but derived boundaries are [${derived.join(", ")}].`,
      target: { type: "edge", id: assertion.edgeId },
      relatedIds: [...new Set([...assertion.boundaryIds, ...derived])].sort(),
    });
  }
  return diagnostics;
}

/**
 * Derive topology facts from authored containment and explicit Overlay sets.
 *
 * This function deliberately accepts no geometry. Pan, zoom, drag, and layout
 * coordinates therefore cannot alter semantic Crossing or transition output.
 */
export function analyzeTopology(
  topology: TopologyModel,
  options: TopologyDerivationOptions = {},
): DerivedTopologyAnalysis {
  const forest = analyzeContainerForest(topology);
  const diagnostics: (ContainerForestDiagnostic | TopologyDerivationDiagnostic)[] = [
    ...forest.diagnostics,
  ];
  const resources = new Map(topology.resources.map((resource) => [resource.id, resource]));
  const edges = new Map(topology.edges.map((edge) => [edge.id, edge]));
  const overlayIds = new Set(topology.overlays.map((overlay) => overlay.id));
  const containerIds = new Set(topology.containers.map((container) => container.id));

  for (const overlay of topology.overlays) {
    for (const member of overlay.members) {
      const known = member.type === "resource"
        ? resources.has(member.id)
        : member.type === "container"
          ? containerIds.has(member.id)
          : overlayIds.has(member.id);
      if (known) continue;
      diagnostics.push({
        level: "error",
        code: "topology_overlay_member_unknown",
        message: `Overlay "${overlay.id}" references unknown ${member.type} "${member.id}".`,
        target: { type: "overlay", id: overlay.id },
        relatedIds: [member.id],
      });
    }
  }

  const membership = explicitResourceOverlays(topology);
  const result: TopologyAnalysisResult = { crossings: [], overlayTransitions: [] };
  for (const edge of topology.edges) {
    const source = resources.get(edge.from);
    const target = resources.get(edge.to);
    if (!source || !target) {
      const missing = [!source ? edge.from : undefined, !target ? edge.to : undefined]
        .filter((id): id is string => id !== undefined);
      diagnostics.push({
        level: "error",
        code: "topology_edge_endpoint_unknown",
        message: `Edge "${edge.id}" references unknown Resource endpoint(s): ${missing.join(", ")}.`,
        target: { type: "edge", id: edge.id },
        relatedIds: missing,
      });
      continue;
    }

    const forward = forwardCrossings(edge, source, target, forest);
    result.crossings.push(...forward);
    const forwardTransition = overlayTransition(
      edge.id,
      "forward",
      membership.get(source.id) ?? new Set(),
      membership.get(target.id) ?? new Set(),
    );
    result.overlayTransitions.push(forwardTransition);

    if (edge.direction === "bidirectional") {
      result.crossings.push(...inverseCrossings(edge.id, forward));
      result.overlayTransitions.push({
        edgeId: edge.id,
        traversal: "reverse",
        gained: forwardTransition.lost.slice(),
        lost: forwardTransition.gained.slice(),
        shared: forwardTransition.shared.slice(),
      });
    }
  }

  diagnostics.push(...compareLegacyAssertions(
    options.legacyAssertions ?? [],
    edges,
    result.crossings,
  ));
  const analysis = createTopologyAnalysis(result);
  return {
    ...analysis,
    valid: !diagnostics.some((item) => item.level === "error"),
    diagnostics,
  };
}
