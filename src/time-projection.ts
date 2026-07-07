/**
 * 4D time projection (v0.2 timeline).
 *
 * Pure helpers that resolve which elements exist — and in what lifecycle
 * state — at a given timeline phase. This is deliberately a *decoration*
 * projection, not a model projection like projectAbstraction: it never
 * clones the model or moves geometry, so layout stays computed from the
 * full (all-time) model and phase switching cannot invalidate the render
 * projection/layout caches.
 *
 * Presence semantics: an element with `lifecycle` exists in the half-open
 * phase interval [added, removed). Elements without a lifecycle exist in
 * every phase. States are sticky forward: a `states` entry takes effect at
 * its phase and persists until overridden by a later entry.
 */

import type { ArchMapModel, Lifecycle, Timeline, TimelinePhase } from "./types.js";

/** Presence interval in phase indices; `removedIndex` is Infinity when never removed. */
export interface PresenceInterval {
  addedIndex: number;
  removedIndex: number;
}

const ALWAYS: PresenceInterval = { addedIndex: 0, removedIndex: Number.POSITIVE_INFINITY };

export function timelinePhaseIndex(timeline: Timeline | undefined): Map<string, number> {
  return new Map((timeline?.phases ?? []).map((phase, index) => [phase.id, index]));
}

/**
 * Presence interval for one lifecycle. Unknown phase references are tolerated
 * here (validation reports them): an unknown `added` behaves as the first
 * phase and an unknown `removed` as never, so a broken reference degrades to
 * "always present" instead of hiding elements.
 */
export function presenceInterval(lifecycle: Lifecycle | undefined, phaseIndex: Map<string, number>): PresenceInterval {
  if (!lifecycle) return ALWAYS;
  const addedIndex = lifecycle.added !== undefined ? phaseIndex.get(lifecycle.added) ?? 0 : 0;
  const removedIndex = lifecycle.removed !== undefined
    ? phaseIndex.get(lifecycle.removed) ?? Number.POSITIVE_INFINITY
    : Number.POSITIVE_INFINITY;
  return { addedIndex, removedIndex };
}

/** Intersection of two presence intervals (used for edge/endpoint derivation). */
export function intersectIntervals(a: PresenceInterval, b: PresenceInterval): PresenceInterval {
  return {
    addedIndex: Math.max(a.addedIndex, b.addedIndex),
    removedIndex: Math.min(a.removedIndex, b.removedIndex),
  };
}

export function intervalContains(interval: PresenceInterval, phaseIdx: number): boolean {
  return phaseIdx >= interval.addedIndex && phaseIdx < interval.removedIndex;
}

/**
 * Effective presence of an edge: its declared lifecycle clamped to the
 * interval in which both endpoints exist — an edge can never outlive (or
 * predate) its endpoints, whatever the author declared.
 */
export function edgePresenceInterval(
  edgeLifecycle: Lifecycle | undefined,
  fromLifecycle: Lifecycle | undefined,
  toLifecycle: Lifecycle | undefined,
  phaseIndex: Map<string, number>,
): PresenceInterval {
  const derived = intersectIntervals(
    presenceInterval(fromLifecycle, phaseIndex),
    presenceInterval(toLifecycle, phaseIndex),
  );
  if (!edgeLifecycle) return derived;
  return intersectIntervals(presenceInterval(edgeLifecycle, phaseIndex), derived);
}

/**
 * Sticky-forward state at a phase: the `states` entry with the greatest
 * phase index <= phaseIdx wins. Returns undefined for the default (active)
 * state, unknown phases, or elements without states.
 */
export function lifecycleStateAt(
  lifecycle: Lifecycle | undefined,
  phaseIdx: number,
  phaseIndex: Map<string, number>,
): string | undefined {
  const states = lifecycle?.states;
  if (!states) return undefined;
  let bestIndex = -1;
  let best: string | undefined;
  for (const [phaseId, state] of Object.entries(states)) {
    const index = phaseIndex.get(phaseId);
    if (index === undefined || index > phaseIdx || index < bestIndex) continue;
    bestIndex = index;
    best = state;
  }
  return best === "active" ? undefined : best;
}

/** Phases of the model's timeline, in resolved order ([] without a timeline). */
export function listTimelinePhases(model: Pick<ArchMapModel, "timeline">): TimelinePhase[] {
  return model.timeline?.phases ?? [];
}

/**
 * Resolve the active phase id: the requested phase when it exists, else the
 * timeline default, else the first phase. Undefined without a timeline.
 */
export function resolvePhaseId(model: Pick<ArchMapModel, "timeline">, requested?: string | null): string | undefined {
  const phases = listTimelinePhases(model);
  if (phases.length === 0) return undefined;
  if (requested && phases.some((phase) => phase.id === requested)) return requested;
  const fallback = model.timeline?.default;
  if (fallback && phases.some((phase) => phase.id === fallback)) return fallback;
  return phases[0].id;
}

/** Which elements are absent — and the non-default states — at one phase. */
export interface PhasePresence {
  phaseId: string;
  phaseIndex: number;
  absentNodes: Set<string>;
  absentEdges: Set<string>;
  absentZones: Set<string>;
  /** id -> effective lifecycle state; only non-"active" entries are present. */
  nodeStates: Map<string, string>;
  edgeStates: Map<string, string>;
  zoneStates: Map<string, string>;
}

/**
 * Compute per-phase presence for every node/edge/zone. O(N+E+Z); elements
 * without lifecycles never enter the absent sets, so a model without any
 * lifecycle produces empty sets. Returns undefined when the model has no
 * timeline or the phase id is unknown.
 */
export function computePhasePresence(model: ArchMapModel, phaseId: string): PhasePresence | undefined {
  const phaseIndex = timelinePhaseIndex(model.timeline);
  const idx = phaseIndex.get(phaseId);
  if (idx === undefined) return undefined;

  const presence: PhasePresence = {
    phaseId,
    phaseIndex: idx,
    absentNodes: new Set(),
    absentEdges: new Set(),
    absentZones: new Set(),
    nodeStates: new Map(),
    edgeStates: new Map(),
    zoneStates: new Map(),
  };

  const nodeLifecycle = new Map(model.nodes.map((node) => [node.id, node.lifecycle]));
  for (const node of model.nodes) {
    if (!intervalContains(presenceInterval(node.lifecycle, phaseIndex), idx)) {
      presence.absentNodes.add(node.id);
      continue;
    }
    const state = lifecycleStateAt(node.lifecycle, idx, phaseIndex);
    if (state) presence.nodeStates.set(node.id, state);
  }
  for (const edge of model.edges) {
    const interval = edgePresenceInterval(
      edge.lifecycle,
      nodeLifecycle.get(edge.from),
      nodeLifecycle.get(edge.to),
      phaseIndex,
    );
    if (!intervalContains(interval, idx)) {
      presence.absentEdges.add(edge.id);
      continue;
    }
    const state = lifecycleStateAt(edge.lifecycle, idx, phaseIndex);
    if (state) presence.edgeStates.set(edge.id, state);
  }
  for (const zone of model.zones) {
    if (!intervalContains(presenceInterval(zone.lifecycle, phaseIndex), idx)) {
      presence.absentZones.add(zone.id);
      continue;
    }
    const state = lifecycleStateAt(zone.lifecycle, idx, phaseIndex);
    if (state) presence.zoneStates.set(zone.id, state);
  }
  return presence;
}

/** DiagramSpec extra-class channels for the active phase (see views/base.ts). */
export interface TimeDecoration {
  nodeExtraClasses: Map<string, string>;
  edgeExtraClasses: Map<string, string>;
  boxExtraClasses: Map<string, string>;
}

const STATE_CLASS: Record<string, string> = {
  planned: "archmap-lifecycle-planned",
  deprecated: "archmap-lifecycle-deprecated",
  removing: "archmap-lifecycle-removing",
};

function stateClass(state: string): string {
  // Unknown states validated elsewhere; render them like the default (active).
  return STATE_CLASS[state] ?? "";
}

/**
 * Map a PhasePresence to render decoration classes. Absent elements are
 * strongly ghosted rather than hidden: layout comes from the full model, so
 * ghosting keeps the evolution delta visible and the geometry explainable.
 */
export function buildTimeDecoration(presence: PhasePresence): TimeDecoration {
  const nodeExtraClasses = new Map<string, string>();
  const edgeExtraClasses = new Map<string, string>();
  const boxExtraClasses = new Map<string, string>();
  for (const id of presence.absentNodes) nodeExtraClasses.set(id, "archmap-phase-absent");
  for (const id of presence.absentEdges) edgeExtraClasses.set(id, "archmap-phase-absent");
  for (const id of presence.absentZones) boxExtraClasses.set(id, "archmap-phase-absent");
  for (const [id, state] of presence.nodeStates) {
    const cls = stateClass(state);
    if (cls) nodeExtraClasses.set(id, cls);
  }
  for (const [id, state] of presence.edgeStates) {
    const cls = stateClass(state);
    if (cls) edgeExtraClasses.set(id, cls);
  }
  for (const [id, state] of presence.zoneStates) {
    const cls = stateClass(state);
    if (cls) boxExtraClasses.set(id, cls);
  }
  return { nodeExtraClasses, edgeExtraClasses, boxExtraClasses };
}
