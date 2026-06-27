/**
 * Parse the YAML metadata section and merge it onto the graph result to build
 * the normalized model (§7–§21, §28).
 *
 * Graph edges and metadata edges are reconciled by (from, to): a metadata edge
 * that matches a graph edge enriches it (and adopts the explicit edge id);
 * metadata-only edges are appended; graph-only edges get a generated id.
 */

import yaml from "js-yaml";
import { diagnostic } from "../diagnostics.js";
import type {
  ArchEdge,
  ArchMapModel,
  ArchNode,
  AuthMeta,
  Boundary,
  BoundaryCrossing,
  DataObject,
  Diagnostic,
  Identity,
  Layout,
  Permission,
  ViewConfig,
  Zone,
} from "../types.js";
import { ARCHMAP_VERSION } from "../types.js";
import type { GraphParseResult } from "./graph.js";
import { applyEdgeInference } from "./inference.js";

type Dict = Record<string, unknown>;

function isObject(v: unknown): v is Dict {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") return [v];
  return undefined;
}

function asStringRecord(v: unknown): Record<string, string> | undefined {
  if (!isObject(v)) return undefined;
  const entries = Object.entries(v).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseResourceRef(v: unknown): Permission["resource"] | undefined {
  if (typeof v === "string") return v;
  if (!isObject(v)) return undefined;
  const type = asString(v.type);
  const id = asString(v.id);
  return type && id ? { type, id } : undefined;
}

function parseBoundaryCrossing(v: unknown): BoundaryCrossing | undefined {
  if (typeof v === "boolean") {
    return v ? { crosses: [], reviewed: true } : { crosses: [], reviewed: true, assertedFalse: true };
  }
  const crosses = asStringArray(v);
  if (crosses) return { crosses, reviewed: true };
  return undefined;
}

function parseAuth(v: unknown): AuthMeta | undefined {
  if (!isObject(v)) return undefined;
  return {
    method: asString(v.method),
    token: asString(v.token),
    issuer: asString(v.issuer),
    audience: asString(v.audience),
    validatedBy: asString(v.validatedBy),
    recipient: asString(v.recipient),
    scopes: asStringArray(v.scopes),
    claims: v.claims,
  };
}

export interface MergeResult {
  model: ArchMapModel;
}

export function buildModel(graph: GraphParseResult, metadataYaml: string): ArchMapModel {
  const errors: Diagnostic[] = [...graph.errors];
  const warnings: Diagnostic[] = [...graph.warnings];

  // --- Parse YAML -----------------------------------------------------------
  let meta: Dict = {};
  if (metadataYaml.trim() !== "") {
    let loaded: unknown;
    try {
      loaded = yaml.load(metadataYaml);
    } catch (e) {
      errors.push(diagnostic("invalid_yaml", `Invalid YAML metadata: ${(e as Error).message}`));
      loaded = undefined;
    }
    if (loaded !== undefined && loaded !== null) {
      if (isObject(loaded)) {
        meta = loaded;
      } else {
        errors.push(diagnostic("metadata_not_object", "Metadata section must be a YAML mapping."));
      }
    }
  }

  // --- Nodes ----------------------------------------------------------------
  const nodes: ArchNode[] = [];
  const nodeById = new Map<string, ArchNode>();
  for (const g of graph.nodes.values()) {
    const node: ArchNode = { id: g.id, label: g.label, shape: g.shape };
    nodes.push(node);
    nodeById.set(node.id, node);
  }

  const metaNodes = isObject(meta.nodes) ? meta.nodes : {};
  for (const [id, value] of Object.entries(metaNodes)) {
    if (!isObject(value)) continue;
    let node = nodeById.get(id);
    if (!node) {
      // Metadata node not in graph: still added to the model (§23.2 warns).
      node = { id, label: asString(value.label) ?? id, shape: "rectangle" };
      nodes.push(node);
      nodeById.set(id, node);
      warnings.push(diagnostic("metadata_node_not_in_graph", `Metadata node "${id}" is not present in the graph.`, { type: "node", id }));
    }
    if (value.label !== undefined) node.label = asString(value.label) ?? node.label;
    node.zone = asString(value.zone);
    node.layer = asString(value.layer);
    node.kind = asString(value.kind);
    node.provider = asString(value.provider);
    node.principal = asString(value.principal);
    node.placement = asStringRecord(value.placement);
    node.contains = asStringArray(value.contains);
    node.tags = asStringArray(value.tags);
    node.description = asString(value.description);
    node.androidComponent = asString(value.androidComponent);
    node.androidLayer = asString(value.androidLayer);
  }

  // --- Edges (spec 01 §7, 02 §6) --------------------------------------------
  const edges: ArchEdge[] = [];
  const usedIds = new Set<string>();
  // Graph-only edges get ids `${from}__${to}__${index}` (02 §6.1).
  const pairCount = new Map<string, number>();
  const genId = (from: string, to: string): string => {
    const base = `${from}__${to}`;
    let i = pairCount.get(base) ?? 0;
    let id = `${base}__${i}`;
    while (usedIds.has(id)) id = `${base}__${++i}`;
    pairCount.set(base, i + 1);
    usedIds.add(id);
    return id;
  };

  // Seed from graph edges; ids assigned after metadata reconciliation.
  const graphEdgeObjs: ArchEdge[] = graph.edges.map((e) => ({
    id: "",
    from: e.from,
    to: e.to,
    pairKey: `${e.from}->${e.to}`,
    source: "graph" as const,
    label: e.label,
    graphLabel: e.label,
  }));
  const matched = new Set<ArchEdge>(); // graph edges consumed by an explicit-id metadata edge
  const enriched = new Set<ArchEdge>(); // graph edges already enriched by a pair key

  /** Apply metadata fields from `value` onto an edge object. */
  const applyFields = (edge: ArchEdge, value: Dict): void => {
    const label = asString(value.label);
    if (label !== undefined) edge.label = label; // metadata label overrides graph label
    edge.flow = asString(value.flow) ?? edge.flow;
    edge.protocol = asString(value.protocol) ?? edge.protocol;
    edge.auth = parseAuth(value.auth) ?? edge.auth;
    edge.principal = asString(value.principal) ?? edge.principal;
    if (value.data !== undefined) {
      edge.data = value.data;
      edge.dataIds = asStringArray(value.data) ?? edge.dataIds;
    }
    edge.networkPath = asStringArray(value.networkPath) ?? edge.networkPath;
    edge.boundaryCrossing = parseBoundaryCrossing(value.boundaryCrossing) ?? edge.boundaryCrossing;
    edge.direction = (asString(value.direction) as ArchEdge["direction"]) ?? edge.direction;
    edge.tags = asStringArray(value.tags) ?? edge.tags;
    edge.description = asString(value.description) ?? edge.description;
  };

  const PAIR_KEY = /^\s*([A-Za-z][A-Za-z0-9_-]*)\s*->\s*([A-Za-z][A-Za-z0-9_-]*)\s*$/;
  const metaEdges = isObject(meta.edges) ? meta.edges : {};
  for (const [key, value] of Object.entries(metaEdges)) {
    if (!isObject(value)) continue;
    const pk = PAIR_KEY.exec(key);
    if (pk) {
      // Pair-key form: a selector for a graph edge (02 §6.2), not a stable id.
      const from = pk[1];
      const to = pk[2];
      const candidates = graphEdgeObjs.filter((ge) => ge.from === from && ge.to === to && !enriched.has(ge));
      if (candidates.length > 1) {
        warnings.push(diagnostic("edge_pair_ambiguous", `Pair key "${key}" matches ${candidates.length} graph edges; use an explicit edge id.`, { type: "edge", id: key }));
      }
      const g = candidates[0];
      if (g) {
        enriched.add(g);
        g.source = "graph+metadata";
        applyFields(g, value); // keeps generated id (pair key is not a stable id)
      } else {
        // No matching graph edge: a metadata-only edge selected by pair key.
        const edge: ArchEdge = { id: genId(from, to), from, to, pairKey: key.replace(/\s/g, ""), source: "metadata" };
        applyFields(edge, value);
        edges.push(edge);
      }
      continue;
    }

    // Explicit-id form: the key is a stable edge id; from/to required.
    const from = asString(value.from);
    const to = asString(value.to);
    if (!from || !to) {
      errors.push(diagnostic("edge_missing_endpoint", `Edge "${key}" must declare both from and to.`, { type: "edge", id: key }));
      continue;
    }
    const edge: ArchEdge = { id: key, from, to, pairKey: `${from}->${to}`, source: "metadata" };
    applyFields(edge, value);
    const g = graphEdgeObjs.find((ge) => !matched.has(ge) && !enriched.has(ge) && ge.from === from && ge.to === to);
    if (g) {
      matched.add(g);
      edge.source = "graph+metadata";
      edge.graphLabel = g.graphLabel;
      if (edge.label === undefined) edge.label = g.label;
    }
    usedIds.add(key);
    edges.push(edge);
  }

  // Append remaining graph edges (incl. pair-key-enriched) with generated ids.
  for (const g of graphEdgeObjs) {
    if (matched.has(g)) continue;
    g.id = genId(g.from, g.to);
    edges.push(g);
  }

  // Inference pass over every edge (§22).
  for (const e of edges) applyEdgeInference(e);

  // --- Zones ----------------------------------------------------------------
  const zones: Zone[] = [];
  // Promote graph subgraphs to zones when not redefined in metadata.
  const metaZones = isObject(meta.zones) ? meta.zones : {};
  for (const [id, value] of Object.entries(metaZones)) {
    if (!isObject(value)) continue;
    zones.push({
      id,
      label: asString(value.label),
      kind: asString(value.kind),
      provider: asString(value.provider),
      parent: asString(value.parent),
      contains: asStringArray(value.contains),
      trustLevel: asString(value.trustLevel),
      owner: asString(value.owner),
      description: asString(value.description),
    });
  }
  for (const sg of graph.subgraphs) {
    if (!zones.some((z) => z.id === sg.id)) {
      zones.push({ id: sg.id, label: sg.label, contains: [...sg.members] });
    }
  }

  // --- Boundaries -----------------------------------------------------------
  const boundaries: Boundary[] = [];
  const metaBoundaries = isObject(meta.boundaries) ? meta.boundaries : {};
  for (const [id, value] of Object.entries(metaBoundaries)) {
    if (!isObject(value)) continue;
    boundaries.push({
      id,
      label: asString(value.label),
      kind: asString(value.kind),
      contains: asStringArray(value.contains),
      zone: asString(value.zone),
      description: asString(value.description),
    });
  }

  // --- Identities -----------------------------------------------------------
  const identities: Identity[] = [];
  const metaIdentities = isObject(meta.identities) ? meta.identities : {};
  for (const [id, value] of Object.entries(metaIdentities)) {
    if (!isObject(value)) continue;
    identities.push({
      id,
      kind: asString(value.kind),
      provider: asString(value.provider),
      attachedTo:
        typeof value.attachedTo === "string" ? value.attachedTo : asStringArray(value.attachedTo),
      description: asString(value.description),
    });
  }

  // --- Permissions ----------------------------------------------------------
  const permissions: Permission[] = [];
  const metaPermissions = isObject(meta.permissions) ? meta.permissions : {};
  for (const [id, value] of Object.entries(metaPermissions)) {
    if (!isObject(value)) continue;
    const principal = asString(value.principal);
    const action = asString(value.action);
    const resource = parseResourceRef(value.resource);
    if (!principal || !action || !resource) {
      warnings.push(diagnostic("permission_incomplete", `Permission "${id}" is missing principal, action, or resource.`, { type: "permission", id }));
    }
    permissions.push({
      id,
      principal: principal ?? "",
      action: action ?? "",
      resource: resource ?? "",
      effect: asString(value.effect),
      role: asString(value.role),
      condition: value.condition,
      description: asString(value.description),
    });
  }

  // --- Data -----------------------------------------------------------------
  const data: DataObject[] = [];
  const metaData = isObject(meta.data) ? meta.data : {};
  for (const [id, value] of Object.entries(metaData)) {
    if (!isObject(value)) continue;
    data.push({
      id,
      label: asString(value.label),
      classification: asString(value.classification),
      storedIn: asStringArray(value.storedIn),
      processedBy: asStringArray(value.processedBy),
      flows: asStringArray(value.flows),
      storage: asString(value.storage),
      retention: asString(value.retention),
      description: asString(value.description),
    });
  }

  normalizeStage2({ nodes, edges, zones, boundaries, data, warnings, errors });

  // --- Layout / View / Title ------------------------------------------------
  const layout = isObject(meta.layout) ? (meta.layout as unknown as Layout) : undefined;
  const view = isObject(meta.view) ? (meta.view as unknown as ViewConfig) : undefined;

  const model: ArchMapModel = {
    version: ARCHMAP_VERSION,
    direction: graph.direction,
    title: asString(meta.title),
    description: asString(meta.description),
    graph: {
      direction: graph.direction,
      subgraphs: Object.fromEntries(graph.subgraphs.map((sg) => [sg.id, { id: sg.id, label: sg.label, members: [...sg.members] }])),
    },
    nodes,
    edges,
    zones,
    boundaries,
    identities,
    permissions,
    data,
    layout,
    view,
    diagnostics: [],
    warnings,
    errors,
    suggestions: [],
    infos: [],
  };
  return model;
}

function normalizeStage2({
  nodes,
  edges,
  zones,
  boundaries,
  data,
  warnings,
  errors,
}: {
  nodes: ArchNode[];
  edges: ArchEdge[];
  zones: Zone[];
  boundaries: Boundary[];
  data: DataObject[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
}): void {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const zoneIds = new Set(zones.map((z) => z.id));
  const boundaryIds = new Set(boundaries.map((b) => b.id));
  const zoneContainsNode = new Map<string, string[]>();
  const zoneContainsZone = new Map<string, string[]>();

  for (const z of zones) {
    z.resolvedContains = [];
    for (const id of z.contains ?? []) {
      const isZone = zoneIds.has(id);
      const isNode = nodeIds.has(id);
      if (isZone && isNode) {
        warnings.push(diagnostic("ambiguous_reference", `Zone "${z.id}" contains ambiguous reference "${id}".`, { type: "zone", id: z.id }));
      }
      if (isZone) {
        z.resolvedContains.push({ type: "zone", id });
        const existing = zoneContainsZone.get(id) ?? [];
        existing.push(z.id);
        zoneContainsZone.set(id, existing);
      } else if (isNode) {
        z.resolvedContains.push({ type: "node", id });
        const existing = zoneContainsNode.get(id) ?? [];
        existing.push(z.id);
        zoneContainsNode.set(id, existing);
      }
    }
  }

  for (const z of zones) {
    const containingZones = zoneContainsZone.get(z.id) ?? [];
    if (z.parent && !zoneIds.has(z.parent)) {
      warnings.push(diagnostic("zone_parent_unknown", `Zone "${z.id}" declares unknown parent zone "${z.parent}".`, { type: "zone", id: z.id }));
    }
    if (containingZones.length > 1) {
      errors.push(diagnostic("zone_parent_conflict", `Zone "${z.id}" is contained by multiple parent zones (${containingZones.join(", ")}).`, { type: "zone", id: z.id }));
    }
    if (z.parent && containingZones.length > 0 && !containingZones.includes(z.parent)) {
      errors.push(diagnostic("zone_parent_conflict", `Zone "${z.id}" declares parent "${z.parent}" but is contained by "${containingZones[0]}".`, { type: "zone", id: z.id }));
    }
    if (z.parent && zoneIds.has(z.parent)) {
      const parent = zones.find((candidate) => candidate.id === z.parent);
      const hasResolvedChild = parent?.resolvedContains?.some((child) => child.type === "zone" && child.id === z.id);
      if (parent && !hasResolvedChild) {
        parent.resolvedContains = [...(parent.resolvedContains ?? []), { type: "zone", id: z.id }];
      }
    }
  }
  emitZoneCycleDiagnostics(zones, zoneContainsZone, errors);

  for (const n of nodes) {
    const containingZones = zoneContainsNode.get(n.id) ?? [];
    if (n.zone) {
      n.resolvedZone = n.zone;
      if (!zoneIds.has(n.zone)) {
        warnings.push(diagnostic("node_zone_unknown", `Node "${n.id}" declares unknown zone "${n.zone}".`, { type: "node", id: n.id }));
      }
      if (containingZones.length > 0 && !containingZones.includes(n.zone)) {
        warnings.push(diagnostic("node_zone_conflict", `Node "${n.id}" declares zone "${n.zone}" but is contained by zone "${containingZones[0]}".`, { type: "node", id: n.id }));
      }
    } else if (containingZones.length > 0) {
      n.resolvedZone = containingZones[0];
      n.zone = containingZones[0];
      if (containingZones.length > 1) {
        warnings.push(diagnostic("node_in_multiple_zones", `Node "${n.id}" is contained by multiple zones (${containingZones.join(", ")}).`, { type: "node", id: n.id }));
      }
    } else if (n.placement?.zone && zoneIds.has(n.placement.zone)) {
      n.resolvedZone = n.placement.zone;
      n.zone = n.placement.zone;
      n.inferred = [...(n.inferred ?? []), "zone"];
    } else {
      n.resolvedZone = "unknown";
    }
  }

  for (const b of boundaries) {
    b.resolvedContains = [];
    for (const id of b.contains ?? []) {
      const matches = [
        boundaryIds.has(id) ? "boundary" : undefined,
        zoneIds.has(id) ? "zone" : undefined,
        nodeIds.has(id) ? "node" : undefined,
      ].filter((x): x is "node" | "zone" | "boundary" => x !== undefined);
      if (matches.length > 1) {
        warnings.push(diagnostic("ambiguous_reference", `Boundary "${b.id}" contains ambiguous reference "${id}".`, { type: "boundary", id: b.id }));
      }
      const type = matches[0];
      if (type) b.resolvedContains.push({ type, id });
    }
  }

  const dataById = new Map(data.map((d) => [d.id, d]));
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const edgesByPair = new Map<string, ArchEdge[]>();
  for (const e of edges) {
    const list = edgesByPair.get(e.pairKey ?? `${e.from}->${e.to}`) ?? [];
    list.push(e);
    edgesByPair.set(e.pairKey ?? `${e.from}->${e.to}`, list);
  }

  const resolveFlowRef = (ref: string, owner: string): ArchEdge | undefined => {
    const byId = edgeById.get(ref);
    if (byId) return byId;
    const byPair = edgesByPair.get(ref);
    if (byPair && byPair.length === 1) return byPair[0];
    if (byPair && byPair.length > 1) {
      warnings.push(diagnostic("data_flow_ambiguous", `Data object "${owner}" references ambiguous flow "${ref}".`, { type: "data", id: owner }));
    }
    return undefined;
  };

  for (const e of edges) {
    if (!e.dataIds) continue;
    for (const id of e.dataIds) {
      const d = dataById.get(id);
      if (!d) {
        warnings.push(diagnostic("edge_unknown_data", `Edge "${e.id}" references unknown data object "${id}".`, { type: "edge", id: e.id }));
        continue;
      }
      const declaredFlows = d.flows ?? [];
      if (declaredFlows.length > 0 && !declaredFlows.some((ref) => resolveFlowRef(ref, d.id)?.id === e.id || ref === e.id)) {
        warnings.push(diagnostic("data_flow_mismatch", `Edge "${e.id}" declares data "${id}" but data object "${id}" does not list that flow.`, { type: "edge", id: e.id }));
      }
      const flows = new Set(declaredFlows);
      flows.add(e.id);
      d.flows = [...flows];
    }
  }

  for (const d of data) {
    const normalizedFlows = new Set<string>();
    for (const ref of d.flows ?? []) {
      const e = resolveFlowRef(ref, d.id);
      if (!e) {
        normalizedFlows.add(ref);
        continue;
      }
      normalizedFlows.add(e.id);
      const ids = new Set(e.dataIds ?? []);
      ids.add(d.id);
      e.dataIds = [...ids];
    }
    d.flows = [...normalizedFlows];
  }
}

function emitZoneCycleDiagnostics(
  zones: Zone[],
  zoneContainsZone: Map<string, string[]>,
  errors: Diagnostic[],
): void {
  const zoneIds = new Set(zones.map((z) => z.id));
  const parentOf = new Map<string, string>();
  for (const z of zones) {
    if (z.parent && zoneIds.has(z.parent)) parentOf.set(z.id, z.parent);
  }
  for (const [child, parents] of zoneContainsZone) {
    if (!parentOf.has(child) && parents.length === 1) parentOf.set(child, parents[0]);
  }

  const emitted = new Set<string>();
  for (const start of zoneIds) {
    const seen = new Map<string, number>();
    let current: string | undefined = start;
    while (current) {
      const previous = seen.get(current);
      if (previous !== undefined) {
        const cycle = [...seen.keys()].slice(previous);
        const key = [...cycle].sort().join(">");
        if (!emitted.has(key)) {
          emitted.add(key);
          errors.push(diagnostic("zone_cycle", `Zone nesting contains a cycle: ${cycle.join(" -> ")} -> ${current}.`, { type: "zone", id: current }));
        }
        break;
      }
      seen.set(current, seen.size);
      current = parentOf.get(current);
    }
  }
}
