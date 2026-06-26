/**
 * Parse the YAML metadata section and merge it onto the graph result to build
 * the normalized model (§7–§21, §28).
 *
 * Graph edges and metadata edges are reconciled by (from, to): a metadata edge
 * that matches a graph edge enriches it (and adopts the explicit edge id);
 * metadata-only edges are appended; graph-only edges get a generated id.
 */

import yaml from "js-yaml";
import type {
  ArchEdge,
  ArchMapModel,
  ArchNode,
  AuthMeta,
  Boundary,
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

function parseAuth(v: unknown): AuthMeta | undefined {
  if (!isObject(v)) return undefined;
  return {
    method: asString(v.method),
    token: asString(v.token),
    issuer: asString(v.issuer),
    audience: asString(v.audience),
    validatedBy: asString(v.validatedBy),
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
      errors.push({ severity: "error", code: "invalid_yaml", message: `Invalid YAML metadata: ${(e as Error).message}` });
      loaded = undefined;
    }
    if (loaded !== undefined && loaded !== null) {
      if (isObject(loaded)) {
        meta = loaded;
      } else {
        errors.push({ severity: "error", code: "metadata_not_object", message: "Metadata section must be a YAML mapping." });
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
      warnings.push({ severity: "warning", code: "metadata_node_not_in_graph", message: `Metadata node "${id}" is not present in the graph.`, ref: { kind: "node", id } });
    }
    if (value.label !== undefined) node.label = asString(value.label) ?? node.label;
    node.zone = asString(value.zone);
    node.layer = asString(value.layer);
    node.kind = asString(value.kind);
    node.provider = asString(value.provider);
    node.principal = asString(value.principal);
    node.contains = asStringArray(value.contains);
    node.tags = asStringArray(value.tags);
    node.description = asString(value.description);
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
    if (value.data !== undefined) edge.data = value.data;
    edge.networkPath = asStringArray(value.networkPath) ?? edge.networkPath;
    if (value.boundaryCrossing !== undefined) {
      edge.boundaryCrossing =
        typeof value.boundaryCrossing === "boolean" ? value.boundaryCrossing : asStringArray(value.boundaryCrossing);
    }
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
        warnings.push({ severity: "warning", code: "edge_pair_ambiguous", message: `Pair key "${key}" matches ${candidates.length} graph edges; use an explicit edge id.`, ref: { kind: "edge", id: key } });
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
      errors.push({ severity: "error", code: "edge_missing_endpoint", message: `Edge "${key}" must declare both from and to.`, ref: { kind: "edge", id: key } });
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
      contains: asStringArray(value.contains),
      trustLevel: asString(value.trustLevel),
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
    const resource = asString(value.resource);
    if (!principal || !action || !resource) {
      warnings.push({ severity: "warning", code: "permission_incomplete", message: `Permission "${id}" is missing principal, action, or resource.`, ref: { kind: "permission", id } });
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
      retention: asString(value.retention),
      description: asString(value.description),
    });
  }

  // --- Layout / View / Title ------------------------------------------------
  const layout = isObject(meta.layout) ? (meta.layout as unknown as Layout) : undefined;
  const view = isObject(meta.view) ? (meta.view as unknown as ViewConfig) : undefined;

  const model: ArchMapModel = {
    version: ARCHMAP_VERSION,
    direction: graph.direction,
    title: asString(meta.title),
    description: asString(meta.description),
    nodes,
    edges,
    zones,
    boundaries,
    identities,
    permissions,
    data,
    layout,
    view,
    warnings,
    errors,
  };
  return model;
}
