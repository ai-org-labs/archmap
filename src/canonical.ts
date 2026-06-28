import type { ArchMapModel, CanonicalArchMapModel } from "./types.js";

function byId<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

/**
 * Convert the compatibility model returned by parse() into the spec v0.1
 * Record-keyed canonical shape. This is the preferred boundary for new runtime
 * integrations while existing renderers continue to consume the array model.
 */
export function toCanonicalModel(model: ArchMapModel): CanonicalArchMapModel {
  const diagnostics = model.diagnostics.length > 0 ? model.diagnostics : [...model.errors, ...model.warnings];
  return {
    version: model.version,
    title: model.title,
    description: model.description,
    source: model.source,
    graph: {
      direction: model.direction,
      subgraphs: model.graph.subgraphs,
    },
    nodes: byId(model.nodes),
    edges: byId(model.edges),
    zones: byId(model.zones),
    boundaries: byId(model.boundaries),
    identities: byId(model.identities),
    permissions: byId(model.permissions),
    data: byId(model.data),
    layout: model.layout,
    view: model.view,
    diagnostics,
    errors: model.errors,
    warnings: model.warnings,
    suggestions: model.suggestions,
    infos: model.infos.length > 0 ? model.infos : diagnostics.filter((d) => d.level === "info" || d.severity === "info"),
  };
}
