import type {
  ArchEdge,
  ArchMapModel,
  ArchNode,
  Boundary,
  DataObject,
  Diagnostic,
  GraphSubgraph,
  Identity,
  Permission,
  Zone,
} from "./types.js";

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function mostCommon(values: Array<string | undefined>): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value || value === "unknown") continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

function subgraphChildren(subgraphs: GraphSubgraph[]): Map<string | undefined, GraphSubgraph[]> {
  const out = new Map<string | undefined, GraphSubgraph[]>();
  for (const sg of subgraphs) {
    const parent = sg.parent;
    out.set(parent, [...(out.get(parent) ?? []), sg]);
  }
  return out;
}

function subgraphDepths(subgraphs: GraphSubgraph[]): Map<string, number> {
  const byId = new Map(subgraphs.map((sg) => [sg.id, sg]));
  const cache = new Map<string, number>();
  const depthOf = (sg: GraphSubgraph): number => {
    const cached = cache.get(sg.id);
    if (cached !== undefined) return cached;
    const parent = sg.parent ? byId.get(sg.parent) : undefined;
    const depth = parent ? depthOf(parent) + 1 : 0;
    cache.set(sg.id, depth);
    return depth;
  };
  for (const sg of subgraphs) depthOf(sg);
  return cache;
}

export function maxSubgraphDepth(model: ArchMapModel): number {
  const subgraphs = Object.values(model.graph.subgraphs);
  if (subgraphs.length === 0) return 0;
  return Math.max(0, ...subgraphDepths(subgraphs).values());
}

function effectiveMembers(
  sg: GraphSubgraph,
  childrenByParent: Map<string | undefined, GraphSubgraph[]>,
  nodeIds: Set<string>,
  seen = new Set<string>(),
): Set<string> {
  if (seen.has(sg.id)) return new Set();
  seen.add(sg.id);
  const out = new Set<string>();
  for (const member of sg.members) {
    if (nodeIds.has(member)) out.add(member);
  }
  for (const child of childrenByParent.get(sg.id) ?? []) {
    for (const member of effectiveMembers(child, childrenByParent, nodeIds, seen)) out.add(member);
  }
  seen.delete(sg.id);
  return out;
}

function replacementFor(id: string, replacements: Map<string, string>): string {
  return replacements.get(id) ?? id;
}

function cloneDiagnostic(diagnostic: Diagnostic, replacements: Map<string, string>, edgeIds: Map<string, string>): Diagnostic {
  const target = diagnostic.target
    ? {
      type: diagnostic.target.type,
      id: diagnostic.target.type === "node"
        ? replacementFor(diagnostic.target.id, replacements)
        : diagnostic.target.type === "edge"
          ? edgeIds.get(diagnostic.target.id) ?? diagnostic.target.id
          : diagnostic.target.id,
    }
    : undefined;
  const ref = diagnostic.ref
    ? {
      kind: diagnostic.ref.kind,
      id: diagnostic.ref.kind === "node"
        ? replacementFor(diagnostic.ref.id, replacements)
        : diagnostic.ref.kind === "edge"
          ? edgeIds.get(diagnostic.ref.id) ?? diagnostic.ref.id
          : diagnostic.ref.id,
    }
    : undefined;
  return { ...diagnostic, ...(target ? { target } : {}), ...(ref ? { ref } : {}) };
}

function rewriteContains<T extends Zone | Boundary>(items: T[], replacements: Map<string, string>): T[] {
  return items.map((item) => {
    const contains = item.contains
      ? unique(item.contains.map((id) => replacementFor(id, replacements)))
      : item.contains;
    const resolvedContains = item.resolvedContains
      ? unique(item.resolvedContains.map((entry) => (
        entry.type === "node" ? `${entry.type}:${replacementFor(entry.id, replacements)}` : `${entry.type}:${entry.id}`
      ))).map((key) => {
        const [type, id] = key.split(":");
        return { type: type as T["resolvedContains"] extends Array<infer U> ? U extends { type: infer K } ? K : never : never, id };
      }) as T["resolvedContains"]
      : item.resolvedContains;
    return { ...item, ...(contains ? { contains } : {}), ...(resolvedContains ? { resolvedContains } : {}) };
  });
}

function rewriteData(data: DataObject[], replacements: Map<string, string>, edgeIds: Map<string, string>): DataObject[] {
  return data.map((entry) => ({
    ...entry,
    storedIn: entry.storedIn ? unique(entry.storedIn.map((id) => replacementFor(id, replacements))) : entry.storedIn,
    processedBy: entry.processedBy ? unique(entry.processedBy.map((id) => replacementFor(id, replacements))) : entry.processedBy,
    flows: entry.flows ? unique(entry.flows.map((id) => edgeIds.get(id) ?? id)) : entry.flows,
  }));
}

function rewriteIdentities(identities: Identity[], replacements: Map<string, string>): Identity[] {
  return identities.map((identity) => {
    if (Array.isArray(identity.attachedTo)) {
      return { ...identity, attachedTo: unique(identity.attachedTo.map((id) => replacementFor(id, replacements))) };
    }
    return identity.attachedTo
      ? { ...identity, attachedTo: replacementFor(identity.attachedTo, replacements) }
      : { ...identity };
  });
}

function rewritePermissionResource(resource: Permission["resource"], replacements: Map<string, string>): Permission["resource"] {
  if (typeof resource === "string") return replacementFor(resource, replacements);
  if (resource && typeof resource === "object" && resource.type === "node") {
    return { ...resource, id: replacementFor(resource.id, replacements) };
  }
  return resource;
}

function rewritePermissions(permissions: Permission[], replacements: Map<string, string>): Permission[] {
  return permissions.map((permission) => ({
    ...permission,
    resource: rewritePermissionResource(permission.resource, replacements),
  }));
}

function abstractionNode(sg: GraphSubgraph, members: ArchNode[]): ArchNode {
  const principals = unique(members.map((node) => node.principal).filter((value): value is string => !!value));
  const layers = members.map((node) => node.layer);
  const zones = members.map((node) => node.resolvedZone ?? node.zone);
  const providers = members.map((node) => node.provider);
  return {
    id: sg.id,
    label: sg.label ?? sg.id,
    shape: "rectangle",
    kind: "subgraph",
    layer: mostCommon(layers),
    zone: mostCommon(zones),
    resolvedZone: mostCommon(zones),
    provider: mostCommon(providers),
    ...(principals.length === 1 ? { principal: principals[0] } : {}),
    contains: members.map((node) => node.id),
    description: `Subgraph abstraction for ${sg.label ?? sg.id}.`,
  };
}

function mergeEdges(edges: ArchEdge[], replacements: Map<string, string>): { edges: ArchEdge[]; edgeIds: Map<string, string> } {
  const byPair = new Map<string, ArchEdge>();
  const counts = new Map<string, number>();
  const edgeIds = new Map<string, string>();
  for (const edge of edges) {
    const from = replacementFor(edge.from, replacements);
    const to = replacementFor(edge.to, replacements);
    if (from === to) continue;
    const key = `${from}\t${to}`;
    const id = `${from}__${to}__abstract`;
    edgeIds.set(edge.id, id);
    const existing = byPair.get(key);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!existing) {
      byPair.set(key, {
        ...edge,
        id,
        from,
        to,
        pairKey: `${from}->${to}`,
        source: edge.source ?? "graph",
        dataIds: edge.dataIds ? [...edge.dataIds] : undefined,
        networkPath: edge.networkPath ? [...edge.networkPath] : undefined,
        inferred: edge.inferred ? [...edge.inferred] : undefined,
      });
      continue;
    }
    existing.dataIds = unique([...(existing.dataIds ?? []), ...(edge.dataIds ?? [])]);
    existing.networkPath = unique([...(existing.networkPath ?? []), ...(edge.networkPath ?? [])]);
    existing.tags = unique([...(existing.tags ?? []), ...(edge.tags ?? [])]);
    if (!existing.auth && edge.auth) existing.auth = { ...edge.auth };
    if (!existing.flow && edge.flow) existing.flow = edge.flow;
    if (!existing.protocol && edge.protocol) existing.protocol = edge.protocol;
    if (!existing.principal && edge.principal) existing.principal = edge.principal;
    if (!existing.boundaryCrossing && edge.boundaryCrossing) existing.boundaryCrossing = { ...edge.boundaryCrossing };
  }
  for (const [key, edge] of byPair) {
    const count = counts.get(key) ?? 1;
    if (count > 1) edge.description = [edge.description, `${count} collapsed edges.`].filter(Boolean).join(" ");
  }
  return { edges: [...byPair.values()], edgeIds };
}

export function projectSubgraphAbstraction(model: ArchMapModel, level = 0): ArchMapModel {
  const requested = Math.max(0, Math.floor(level));
  if (requested === 0) return model;
  const subgraphs = Object.values(model.graph.subgraphs);
  if (subgraphs.length === 0) return model;

  const depths = subgraphDepths(subgraphs);
  const targetDepth = requested - 1;
  const selected = subgraphs.filter((sg) => depths.get(sg.id) === targetDepth);
  if (selected.length === 0) return model;

  const nodeIds = new Set(model.nodes.map((node) => node.id));
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const childrenByParent = subgraphChildren(subgraphs);
  const replacements = new Map<string, string>();
  const synthetic: ArchNode[] = [];

  for (const sg of selected) {
    const memberIds = [...effectiveMembers(sg, childrenByParent, nodeIds)];
    if (memberIds.length === 0) continue;
    for (const id of memberIds) {
      if (!replacements.has(id)) replacements.set(id, sg.id);
    }
    const members = memberIds.map((id) => nodeById.get(id)).filter((node): node is ArchNode => !!node);
    synthetic.push(abstractionNode(sg, members));
  }
  if (replacements.size === 0) return model;

  const hidden = new Set(replacements.keys());
  const visibleNodes = model.nodes.filter((node) => !hidden.has(node.id) && !synthetic.some((sg) => sg.id === node.id));
  const { edges, edgeIds } = mergeEdges(model.edges, replacements);

  const diagnostics = model.diagnostics.map((entry) => cloneDiagnostic(entry, replacements, edgeIds));
  const errors = model.errors.map((entry) => cloneDiagnostic(entry, replacements, edgeIds));
  const warnings = model.warnings.map((entry) => cloneDiagnostic(entry, replacements, edgeIds));
  const suggestions = model.suggestions.map((entry) => cloneDiagnostic(entry, replacements, edgeIds));
  const infos = model.infos.map((entry) => cloneDiagnostic(entry, replacements, edgeIds));

  return {
    ...model,
    nodes: [...visibleNodes, ...synthetic],
    edges,
    zones: rewriteContains(model.zones, replacements),
    boundaries: rewriteContains(model.boundaries, replacements),
    identities: rewriteIdentities(model.identities, replacements),
    permissions: rewritePermissions(model.permissions, replacements),
    data: rewriteData(model.data, replacements, edgeIds),
    diagnostics,
    errors,
    warnings,
    suggestions,
    infos,
  };
}
