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

  // --- Edges ----------------------------------------------------------------
  const edges: ArchEdge[] = [];
  const usedIds = new Set<string>();
  const genId = (from: string, to: string): string => {
    let base = `${from}_${to}`;
    let id = base;
    let n = 2;
    while (usedIds.has(id)) id = `${base}_${n++}`;
    usedIds.add(id);
    return id;
  };

  // Seed from graph edges; index by from->to for reconciliation.
  const graphEdgeObjs: ArchEdge[] = graph.edges.map((e) => ({
    id: "", // assigned after metadata reconciliation
    from: e.from,
    to: e.to,
    label: e.label,
  }));
  const matched = new Set<ArchEdge>();

  const metaEdges = isObject(meta.edges) ? meta.edges : {};
  for (const [id, value] of Object.entries(metaEdges)) {
    if (!isObject(value)) continue;
    const from = asString(value.from);
    const to = asString(value.to);
    if (!from || !to) {
      errors.push({ severity: "error", code: "edge_missing_endpoint", message: `Edge "${id}" must declare both from and to.`, ref: { kind: "edge", id } });
      continue;
    }
    const edge: ArchEdge = {
      id,
      from,
      to,
      label: asString(value.label),
      flow: asString(value.flow),
      protocol: asString(value.protocol),
      auth: parseAuth(value.auth),
      principal: asString(value.principal),
      data: value.data,
      networkPath: asStringArray(value.networkPath),
      boundaryCrossing:
        typeof value.boundaryCrossing === "boolean"
          ? value.boundaryCrossing
          : asStringArray(value.boundaryCrossing),
      direction: asString(value.direction) as ArchEdge["direction"],
      tags: asStringArray(value.tags),
      description: asString(value.description),
    };
    // Reconcile with a graph edge of the same endpoints.
    const g = graphEdgeObjs.find((ge) => !matched.has(ge) && ge.from === from && ge.to === to);
    if (g) {
      matched.add(g);
      if (edge.label === undefined) edge.label = g.label;
    }
    usedIds.add(id);
    edges.push(edge);
  }

  // Append graph-only edges with generated ids.
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
