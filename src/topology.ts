/**
 * ArchMap Next canonical topology contracts.
 *
 * Authored topology and derived analysis intentionally use separate types.
 * Provider-specific containment and network rules belong to validators, not
 * these Core contracts.
 */

export type TopologyExtensions = Record<string, unknown>;

export type LegacyTopologyElementType = "node" | "zone" | "boundary" | "edge";

/** Stable pointer back to the released model element used for migration. */
export interface TopologyProvenance {
  source: "legacy";
  type: LegacyTopologyElementType;
  id: string;
}

/** An endpoint-capable entity in the authored topology. */
export interface Resource {
  id: string;
  label?: string;
  kind?: string;
  /** Direct structural parent only. Ancestors are derived. */
  parent: string | null;
  note?: string;
  extensions?: TopologyExtensions;
  provenance?: TopologyProvenance[];
}

/** A single-parent structural boundary. Containers form a forest. */
export interface ContainerBoundary {
  id: string;
  label?: string;
  kind?: string;
  roles: string[];
  parent: string | null;
  /** Resources associated with enforcement of this boundary's meaning. */
  enforcedBy?: string[];
  note?: string;
  extensions?: TopologyExtensions;
  provenance?: TopologyProvenance[];
}

export interface OverlayMember {
  type: "resource" | "container" | "overlay";
  id: string;
}

export type OverlayRenderHint = "outline" | "highlight" | "badge";

/** A freely overlapping semantic set with explicit membership. */
export interface OverlayBoundary {
  id: string;
  label?: string;
  kind?: string;
  roles?: string[];
  members: OverlayMember[];
  render?: OverlayRenderHint;
  note?: string;
  extensions?: TopologyExtensions;
  provenance?: TopologyProvenance[];
}

export type TopologyEdgeDirection = "directed" | "bidirectional";

/** One actual direct Resource-to-Resource communication. */
export interface TopologyEdge {
  id: string;
  from: string;
  to: string;
  direction: TopologyEdgeDirection;
  protocol?: string;
  port?: number | string;
  note?: string;
  extensions?: TopologyExtensions;
  provenance?: TopologyProvenance[];
}

/** Author-controlled facts. Derived crossings never belong in this object. */
export interface TopologyModel {
  resources: Resource[];
  containers: ContainerBoundary[];
  overlays: OverlayBoundary[];
  edges: TopologyEdge[];
}

export type TopologyTraversal = "forward" | "reverse";
export type CrossingDirection = "enter" | "exit";

/** A structural boundary change derived from one Edge traversal. */
export interface Crossing {
  id: string;
  edgeId: string;
  traversal: TopologyTraversal;
  sequence: number;
  boundaryId: string;
  direction: CrossingDirection;
  roles: string[];
}

/** Semantic set changes derived from one Edge traversal. */
export interface OverlayTransition {
  edgeId: string;
  traversal: TopologyTraversal;
  gained: string[];
  lost: string[];
  shared: string[];
}

/** Serializable output of topology analysis. It is never authored input. */
export interface TopologyAnalysisResult {
  crossings: Crossing[];
  overlayTransitions: OverlayTransition[];
}

/** Read-only query surface over a derived analysis result. */
export interface TopologyAnalysis {
  readonly crossings: readonly Crossing[];
  readonly overlayTransitions: readonly OverlayTransition[];
  crossingsForEdge(edgeId: string, traversal?: TopologyTraversal): readonly Crossing[];
  overlayTransitionForEdge(
    edgeId: string,
    traversal?: TopologyTraversal,
  ): OverlayTransition | undefined;
}

/**
 * Wrap a derived result with stable Edge-oriented queries.
 *
 * This function does not derive, validate, or otherwise modify analysis data.
 * Deterministic derivation is provided separately by the topology analyzer.
 */
export function createTopologyAnalysis(result: TopologyAnalysisResult): TopologyAnalysis {
  const crossings = result.crossings.slice();
  const overlayTransitions = result.overlayTransitions.slice();

  return {
    crossings,
    overlayTransitions,
    crossingsForEdge(edgeId, traversal) {
      return crossings.filter((crossing) => (
        crossing.edgeId === edgeId
        && (traversal === undefined || crossing.traversal === traversal)
      ));
    },
    overlayTransitionForEdge(edgeId, traversal = "forward") {
      return overlayTransitions.find((transition) => (
        transition.edgeId === edgeId && transition.traversal === traversal
      ));
    },
  };
}
