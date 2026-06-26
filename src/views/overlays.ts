import type { LayoutResult } from "../layout.js";
import type { ArchMapModel, BoundaryCrossing, Permission } from "../types.js";
import type { Box } from "./base.js";

export const OVERLAY_NAMES = new Set(["auth", "dataflow", "boundary", "permission", "validation"]);

export interface OverlayProjection {
  emphasizeNodes?: Set<string>;
  emphasizeEdges?: Set<string>;
  nodeBadges?: Map<string, string>;
  boxGroups?: Array<{ boxes: Box[]; boxClass: string }>;
}

const AUTH_KINDS = new Set([
  "identity_provider", "oauth_provider", "auth_service",
  "user", "external_user", "service_account",
]);
const AUTH_FLOWS = new Set(["auth", "token_issue", "token_validate"]);

const STORAGE_KINDS = new Set([
  "database", "relational_database", "nosql_database", "object_storage",
  "file_storage", "cache", "data_warehouse", "legacy_database",
  "queue", "topic", "event_bus",
]);
const DATA_FLOWS = new Set([
  "data_access", "data_write", "data_read", "replication", "sync",
  "event_publish", "event_subscribe", "message_send", "message_receive", "batch",
]);

function crosses(value: BoundaryCrossing | undefined): boolean {
  return value !== undefined && !value.assertedFalse;
}

function addAll<T>(target: Set<T>, values: Iterable<T>): void {
  for (const value of values) target.add(value);
}

function setBadge(badges: Map<string, string>, id: string, value: string): void {
  if (!badges.has(id)) badges.set(id, value);
}

function permissionResourceId(permission: Permission): string | undefined {
  if (typeof permission.resource === "string") return permission.resource;
  if (permission.resource && typeof permission.resource === "object") return permission.resource.id;
  return undefined;
}

export function buildOverlayProjection(model: ArchMapModel, layout: LayoutResult, overlays: string[]): OverlayProjection {
  const active = overlays.filter((overlay) => OVERLAY_NAMES.has(overlay));
  const nodes = new Set<string>();
  const edges = new Set<string>();
  const badges = new Map<string, string>();
  const boxGroups: Array<{ boxes: Box[]; boxClass: string }> = [];
  const nodeIds = new Set(model.nodes.map((n) => n.id));
  const edgeById = new Map(model.edges.map((e) => [e.id, e]));
  const nodeByPrincipal = new Map<string, string[]>();
  for (const node of model.nodes) {
    if (!node.principal) continue;
    nodeByPrincipal.set(node.principal, [...(nodeByPrincipal.get(node.principal) ?? []), node.id]);
  }

  if (active.includes("boundary")) {
    boxGroups.push({ boxes: layout.boundaries, boxClass: "archmap-boundary" });
    const zoneOf = new Map(model.nodes.map((n) => [n.id, n.resolvedZone === "unknown" ? undefined : n.resolvedZone ?? n.zone]));
    for (const edge of layout.edges) {
      const modelEdge = edgeById.get(edge.id);
      const za = zoneOf.get(edge.from);
      const zb = zoneOf.get(edge.to);
      const zoneCross = za !== undefined && zb !== undefined && za !== zb;
      if (crosses(modelEdge?.boundaryCrossing) || zoneCross) {
        edges.add(edge.id);
        nodes.add(edge.from);
        nodes.add(edge.to);
      }
    }
  }

  if (active.includes("dataflow")) {
    for (const node of model.nodes) {
      if (node.kind && STORAGE_KINDS.has(node.kind)) nodes.add(node.id);
    }
    for (const edge of model.edges) {
      if (edge.flow && DATA_FLOWS.has(edge.flow)) {
        edges.add(edge.id);
        nodes.add(edge.from);
        nodes.add(edge.to);
      }
    }
    for (const data of model.data) {
      for (const id of data.storedIn ?? []) {
        nodes.add(id);
        if (data.classification) setBadge(badges, id, data.classification);
      }
      for (const id of data.processedBy ?? []) nodes.add(id);
      for (const flow of data.flows ?? []) {
        const edge = edgeById.get(flow);
        if (!edge) continue;
        edges.add(flow);
        nodes.add(edge.from);
        nodes.add(edge.to);
      }
    }
  }

  if (active.includes("auth")) {
    for (const node of model.nodes) {
      if (node.kind && AUTH_KINDS.has(node.kind)) nodes.add(node.id);
    }
    for (const edge of model.edges) {
      const carriesToken = !!edge.auth?.token || !!edge.auth?.method;
      const authFlow = edge.flow ? AUTH_FLOWS.has(edge.flow) : false;
      if (!carriesToken && !authFlow) continue;
      edges.add(edge.id);
      nodes.add(edge.from);
      nodes.add(edge.to);
      if (edge.auth?.issuer && nodeIds.has(edge.auth.issuer)) nodes.add(edge.auth.issuer);
      if (edge.auth?.validatedBy && nodeIds.has(edge.auth.validatedBy)) nodes.add(edge.auth.validatedBy);
      if (edge.auth?.recipient && nodeIds.has(edge.auth.recipient)) nodes.add(edge.auth.recipient);
      if (edge.auth?.token) setBadge(badges, edge.to, edge.auth.token);
    }
  }

  if (active.includes("permission")) {
    for (const permission of model.permissions) {
      const resource = permissionResourceId(permission);
      addAll(nodes, nodeByPrincipal.get(permission.principal) ?? []);
      if (resource && nodeIds.has(resource)) {
        nodes.add(resource);
        setBadge(badges, resource, permission.role ?? permission.action ?? permission.effect ?? "permission");
      }
    }
  }

  if (active.includes("validation")) {
    for (const diagnostic of model.diagnostics.length ? model.diagnostics : [...model.errors, ...model.warnings]) {
      const target = diagnostic.target ?? (diagnostic.ref ? { type: diagnostic.ref.kind, id: diagnostic.ref.id } : undefined);
      if (!target) continue;
      if (target.type === "node") {
        nodes.add(target.id);
        badges.set(target.id, diagnostic.level === "error" || diagnostic.severity === "error" ? "ERR" : "WARN");
      } else if (target.type === "edge") {
        edges.add(target.id);
      }
    }
  }

  return {
    emphasizeNodes: nodes.size ? nodes : undefined,
    emphasizeEdges: edges.size ? edges : undefined,
    nodeBadges: badges.size ? badges : undefined,
    boxGroups: boxGroups.length ? boxGroups : undefined,
  };
}
