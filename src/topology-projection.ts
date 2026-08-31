import { createTopologyAnalysis } from "./topology.js";
import type {
  ContainerBoundary,
  Crossing,
  OverlayBoundary,
  OverlayTransition,
  Resource,
  TopologyAnalysis,
  TopologyEdge,
  TopologyModel,
} from "./topology.js";

export interface TopologyIdFilter {
  /** When present, only these canonical IDs are eligible for the projection. */
  include?: readonly string[];
  /** Exclusions are applied after inclusions. */
  exclude?: readonly string[];
}

export interface TopologyEdgeFilter extends TopologyIdFilter {
  /** Keep Edges with at least one already-derived Crossing carrying any role. */
  crossingRoles?: readonly string[];
}

export interface TopologyCrossingFilter {
  visible?: boolean;
  roles?: readonly string[];
}

export interface TopologyTransitionFilter {
  visible?: boolean;
}

/** Serializable View intent. It filters facts but cannot author new topology. */
export interface TopologyProjectionView {
  resources?: TopologyIdFilter;
  edges?: TopologyEdgeFilter;
  containers?: TopologyIdFilter;
  overlays?: TopologyIdFilter;
  crossings?: TopologyCrossingFilter;
  overlayTransitions?: TopologyTransitionFilter;
}

/** A non-canonical, read-only projection over canonical authored and derived facts. */
export interface ProjectedTopology {
  readonly resources: readonly Resource[];
  readonly edges: readonly TopologyEdge[];
  readonly containers: readonly ContainerBoundary[];
  readonly overlays: readonly OverlayBoundary[];
  readonly analysis: TopologyAnalysis;
  readonly visibleResourceIds: ReadonlySet<string>;
  readonly visibleEdgeIds: ReadonlySet<string>;
  readonly visibleContainerIds: ReadonlySet<string>;
  readonly visibleOverlayIds: ReadonlySet<string>;
}

function selectedIds<T extends { id: string }>(
  values: readonly T[],
  filter?: TopologyIdFilter,
): Set<string> {
  const available = new Set(values.map(({ id }) => id));
  const selected = filter?.include === undefined
    ? new Set(available)
    : new Set(filter.include.filter((id) => available.has(id)));
  for (const id of filter?.exclude ?? []) selected.delete(id);
  return selected;
}

function hasSelectedRole(crossing: Crossing, roles: ReadonlySet<string>): boolean {
  return crossing.roles.some((role) => roles.has(role));
}

function projectTransition(
  transition: OverlayTransition,
  visibleOverlayIds: ReadonlySet<string>,
): OverlayTransition {
  return {
    ...transition,
    gained: transition.gained.filter((id) => visibleOverlayIds.has(id)),
    lost: transition.lost.filter((id) => visibleOverlayIds.has(id)),
    shared: transition.shared.filter((id) => visibleOverlayIds.has(id)),
  };
}

/**
 * Project canonical topology and its analysis without synthesizing facts.
 *
 * In particular, an excluded Resource removes every incident Edge. No Edge is
 * ever rewired around a hidden intermediate Resource. Container visibility is
 * intentionally not consulted when projecting Crossings.
 */
export function projectTopology(
  topology: TopologyModel,
  analysis: TopologyAnalysis,
  view: TopologyProjectionView = {},
): ProjectedTopology {
  const visibleResourceIds = selectedIds(topology.resources, view.resources);
  const requestedEdgeIds = selectedIds(topology.edges, view.edges);
  const visibleContainerIds = selectedIds(topology.containers, view.containers);
  const visibleOverlayIds = selectedIds(topology.overlays, view.overlays);
  const edgeCrossingRoles = new Set(view.edges?.crossingRoles ?? []);

  const eligibleCrossingEdgeIds = edgeCrossingRoles.size === 0
    ? undefined
    : new Set(analysis.crossings
      .filter((crossing) => hasSelectedRole(crossing, edgeCrossingRoles))
      .map((crossing) => crossing.edgeId));

  const edges = topology.edges.filter((edge) => (
    requestedEdgeIds.has(edge.id)
    && visibleResourceIds.has(edge.from)
    && visibleResourceIds.has(edge.to)
    && (eligibleCrossingEdgeIds === undefined || eligibleCrossingEdgeIds.has(edge.id))
  ));
  const visibleEdgeIds = new Set(edges.map(({ id }) => id));
  const crossingRoles = new Set(view.crossings?.roles ?? []);
  const crossings = view.crossings?.visible === false
    ? []
    : analysis.crossings.filter((crossing) => (
      visibleEdgeIds.has(crossing.edgeId)
      && (crossingRoles.size === 0 || hasSelectedRole(crossing, crossingRoles))
    ));
  const overlayTransitions = view.overlayTransitions?.visible === false
    ? []
    : analysis.overlayTransitions
      .filter((transition) => visibleEdgeIds.has(transition.edgeId))
      .map((transition) => projectTransition(transition, visibleOverlayIds));

  return {
    resources: topology.resources.filter((resource) => visibleResourceIds.has(resource.id)),
    edges,
    containers: topology.containers.filter((container) => visibleContainerIds.has(container.id)),
    overlays: topology.overlays.filter((overlay) => visibleOverlayIds.has(overlay.id)),
    analysis: createTopologyAnalysis({ crossings, overlayTransitions }),
    visibleResourceIds,
    visibleEdgeIds,
    visibleContainerIds,
    visibleOverlayIds,
  };
}
