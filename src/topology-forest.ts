import type { ContainerBoundary, TopologyModel } from "./topology.js";

export type ContainerForestDiagnosticLevel = "error";

export type ContainerForestDiagnosticCode =
  | "container_duplicate_id"
  | "container_multiple_parents"
  | "container_parent_unknown"
  | "container_parent_cycle"
  | "resource_parent_unknown";

export interface ContainerForestDiagnostic {
  level: ContainerForestDiagnosticLevel;
  code: ContainerForestDiagnosticCode;
  message: string;
  target: { type: "container" | "resource"; id: string };
  relatedIds?: string[];
}

/** Deterministic proof of the authored Container forest. */
export interface ContainerForest {
  valid: boolean;
  /** Root IDs in authored order. */
  roots: string[];
  /** One canonical declaration per ID, preserving first-authored order. */
  containers: Record<string, ContainerBoundary>;
  /** Direct parent by Container ID. */
  parents: Record<string, string | null>;
  /** Direct children in authored order. Root children are listed under `null`. */
  children: Record<string, string[]>;
  /** Ancestors ordered root to direct parent. */
  ancestors: Record<string, string[]>;
  diagnostics: ContainerForestDiagnostic[];
}

export interface ContainerLayoutBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ContainerLayoutFailureCode =
  | "container_sibling_overlap"
  | "container_sibling_clearance"
  | "container_descendant_outside_parent";

export interface ContainerLayoutFailure {
  code: ContainerLayoutFailureCode;
  containerId: string;
  relatedContainerId: string;
  message: string;
}

function diagnostic(
  code: ContainerForestDiagnosticCode,
  id: string,
  message: string,
  type: "container" | "resource" = "container",
  relatedIds?: string[],
): ContainerForestDiagnostic {
  return {
    level: "error",
    code,
    message,
    target: { type, id },
    ...(relatedIds && relatedIds.length > 0 ? { relatedIds } : {}),
  };
}

/**
 * Resolve and prove the Container forest without applying provider semantics.
 *
 * Ancestors are root-first so crossing derivation can compare two chains by
 * their common prefix. Invalid chains intentionally resolve to an empty list.
 */
export function analyzeContainerForest(topology: TopologyModel): ContainerForest {
  const diagnostics: ContainerForestDiagnostic[] = [];
  const containers: Record<string, ContainerBoundary> = {};
  const authoredIds: string[] = [];
  const declarations = new Map<string, ContainerBoundary[]>();

  for (const container of topology.containers) {
    const existing = declarations.get(container.id) ?? [];
    declarations.set(container.id, [...existing, container]);
    if (!(container.id in containers)) {
      containers[container.id] = container;
      authoredIds.push(container.id);
    }
  }

  for (const [id, entries] of declarations) {
    if (entries.length <= 1) continue;
    const parents = [...new Set(entries.map((entry) => entry.parent))];
    diagnostics.push(diagnostic(
      parents.length > 1 ? "container_multiple_parents" : "container_duplicate_id",
      id,
      parents.length > 1
        ? `Container "${id}" declares multiple structural parents: ${parents.map((parent) => parent ?? "null").join(", ")}.`
        : `Container "${id}" is declared more than once.`,
      "container",
      parents.map((parent) => parent ?? "null"),
    ));
  }

  const known = new Set(authoredIds);
  const parents: Record<string, string | null> = {};
  for (const id of authoredIds) {
    const parent = containers[id].parent;
    parents[id] = parent;
    if (parent !== null && !known.has(parent)) {
      diagnostics.push(diagnostic(
        "container_parent_unknown",
        id,
        `Container "${id}" references unknown parent "${parent}".`,
        "container",
        [parent],
      ));
    }
  }

  for (const resource of topology.resources) {
    if (resource.parent !== null && !known.has(resource.parent)) {
      diagnostics.push(diagnostic(
        "resource_parent_unknown",
        resource.id,
        `Resource "${resource.id}" references unknown Container parent "${resource.parent}".`,
        "resource",
        [resource.parent],
      ));
    }
  }

  const cycleMembers = new Set<string>();
  const state = new Map<string, "visiting" | "visited">();
  const stack: string[] = [];
  const visit = (id: string): void => {
    if (state.get(id) === "visited") return;
    if (state.get(id) === "visiting") {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(start), id];
      for (const member of cycle.slice(0, -1)) cycleMembers.add(member);
      diagnostics.push(diagnostic(
        "container_parent_cycle",
        id,
        `Container parent cycle detected: ${cycle.join(" -> ")}.`,
        "container",
        cycle,
      ));
      return;
    }
    state.set(id, "visiting");
    stack.push(id);
    const parent = parents[id];
    if (parent !== null && known.has(parent)) visit(parent);
    stack.pop();
    state.set(id, "visited");
  };
  for (const id of authoredIds) visit(id);

  const children: Record<string, string[]> = { null: [] };
  for (const id of authoredIds) children[id] = [];
  for (const id of authoredIds) {
    const parent = parents[id];
    if (parent === null) children.null.push(id);
    else if (known.has(parent)) children[parent].push(id);
  }

  const ancestors: Record<string, string[]> = {};
  for (const id of authoredIds) {
    if (cycleMembers.has(id)) {
      ancestors[id] = [];
      continue;
    }
    const chain: string[] = [];
    const seen = new Set<string>([id]);
    let parent = parents[id];
    let valid = true;
    while (parent !== null) {
      if (!known.has(parent) || seen.has(parent)) {
        valid = false;
        break;
      }
      seen.add(parent);
      chain.push(parent);
      parent = parents[parent];
    }
    ancestors[id] = valid ? chain.reverse() : [];
  }

  return {
    valid: diagnostics.length === 0,
    roots: [...children.null],
    containers,
    parents,
    children,
    ancestors,
    diagnostics,
  };
}

function boxesOverlap(a: ContainerLayoutBox, b: ContainerLayoutBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x
    && a.y < b.y + b.h && a.y + a.h > b.y;
}

function boxGap(a: ContainerLayoutBox, b: ContainerLayoutBox): number {
  const horizontal = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const vertical = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.max(horizontal, vertical);
}

function containsBox(parent: ContainerLayoutBox, child: ContainerLayoutBox, tolerance: number): boolean {
  return child.x >= parent.x - tolerance
    && child.y >= parent.y - tolerance
    && child.x + child.w <= parent.x + parent.w + tolerance
    && child.y + child.h <= parent.y + parent.h + tolerance;
}

/** Validate renderer-owned Container geometry against the canonical forest. */
export function validateContainerLayout(
  forest: ContainerForest,
  boxes: readonly ContainerLayoutBox[],
  options: { minimumSiblingGap?: number; tolerance?: number } = {},
): ContainerLayoutFailure[] {
  const minimumSiblingGap = Math.max(0, options.minimumSiblingGap ?? 0);
  const tolerance = Math.max(0, options.tolerance ?? 0.001);
  const byId = new Map(boxes.map((box) => [box.id, box]));
  const failures: ContainerLayoutFailure[] = [];

  for (const siblings of Object.values(forest.children)) {
    for (let i = 0; i < siblings.length; i++) {
      const a = byId.get(siblings[i]);
      if (!a) continue;
      for (let j = i + 1; j < siblings.length; j++) {
        const b = byId.get(siblings[j]);
        if (!b) continue;
        if (boxesOverlap(a, b)) {
          failures.push({
            code: "container_sibling_overlap",
            containerId: a.id,
            relatedContainerId: b.id,
            message: `Sibling Containers "${a.id}" and "${b.id}" overlap.`,
          });
        } else if (boxGap(a, b) + tolerance < minimumSiblingGap) {
          failures.push({
            code: "container_sibling_clearance",
            containerId: a.id,
            relatedContainerId: b.id,
            message: `Sibling Containers "${a.id}" and "${b.id}" do not keep the required ${minimumSiblingGap}px clearance.`,
          });
        }
      }
    }
  }

  for (const [childId, parentId] of Object.entries(forest.parents)) {
    if (parentId === null) continue;
    const child = byId.get(childId);
    const parent = byId.get(parentId);
    if (!child || !parent || containsBox(parent, child, tolerance)) continue;
    failures.push({
      code: "container_descendant_outside_parent",
      containerId: childId,
      relatedContainerId: parentId,
      message: `Container "${childId}" is not fully contained by parent "${parentId}".`,
    });
  }

  return failures;
}
