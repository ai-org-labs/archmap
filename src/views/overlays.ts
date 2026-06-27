import type { LayoutResult } from "../layout.js";
import type { ArchMapModel, BoundaryCrossing, Permission } from "../types.js";
import type { Box } from "./base.js";

export const OVERLAY_NAMES = new Set(["zone", "auth", "dataflow", "boundary", "permission", "validation"]);

export interface OverlayEdgeBadge {
  kind: "auth-summary";
  label: string;
  title?: string;
}

export interface OverlayProjection {
  emphasizeNodes?: Set<string>;
  emphasizeEdges?: Set<string>;
  nodeBadges?: Map<string, string>;
  edgeBadges?: Map<string, OverlayEdgeBadge[]>;
  overlayEdges?: Array<{ id: string; from: string; to: string; label?: string; className?: string }>;
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
  if (permission.resource && typeof permission.resource === "object" && permission.resource.type === "node") return permission.resource.id;
  return undefined;
}

function attachedNodeIds(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function permissionLabel(permission: Permission): string {
  return permission.role ?? permission.action ?? permission.effect ?? "permission";
}

export function buildOverlayProjection(model: ArchMapModel, layout: LayoutResult, overlays: string[]): OverlayProjection {
  const active = overlays.filter((overlay) => OVERLAY_NAMES.has(overlay));
  const nodes = new Set<string>();
  const edges = new Set<string>();
  const badges = new Map<string, string>();
  const edgeBadges = new Map<string, OverlayEdgeBadge[]>();
  const overlayEdges: OverlayProjection["overlayEdges"] = [];
  const boxGroups: Array<{ boxes: Box[]; boxClass: string }> = [];
  const nodeIds = new Set(model.nodes.map((n) => n.id));
  const edgeById = new Map(model.edges.map((e) => [e.id, e]));
  const edgesByNodePair = new Map<string, string[]>();
  for (const edge of model.edges) {
    const key = edge.from < edge.to ? `${edge.from}\t${edge.to}` : `${edge.to}\t${edge.from}`;
    edgesByNodePair.set(key, [...(edgesByNodePair.get(key) ?? []), edge.id]);
  }
  const nodeByPrincipal = new Map<string, string[]>();
  for (const node of model.nodes) {
    if (!node.principal) continue;
    nodeByPrincipal.set(node.principal, [...(nodeByPrincipal.get(node.principal) ?? []), node.id]);
  }
  const identityAttachment = new Map(model.identities.map((identity) => [identity.id, attachedNodeIds(identity.attachedTo)]));

  if (active.includes("zone")) {
    boxGroups.push({ boxes: layout.zones, boxClass: "archmap-zone" });
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
      const title = [
        edge.auth?.token ? `token: ${edge.auth.token}` : undefined,
        edge.auth?.method ? `method: ${edge.auth.method}` : undefined,
        edge.auth?.issuer ? `issuer: ${edge.auth.issuer}` : undefined,
        edge.auth?.validatedBy ? `validator: ${edge.auth.validatedBy}` : undefined,
        edge.auth?.recipient ? `recipient: ${edge.auth.recipient}` : undefined,
      ].filter(Boolean).join("\n");
      const labelParts = [
        edge.auth?.token,
        edge.auth?.issuer ? `issuer ${edge.auth.issuer}` : undefined,
        edge.auth?.validatedBy ? `validator ${edge.auth.validatedBy}` : undefined,
        edge.auth?.recipient ? `recipient ${edge.auth.recipient}` : undefined,
      ].filter(Boolean);
      if (edge.auth?.token) {
        setBadge(badges, edge.to, `auth:${edge.auth.token}`);
      }
      if (labelParts.length) edgeBadges.set(edge.id, [{ kind: "auth-summary", label: labelParts.join(" · "), title }]);
    }
  }

  if (active.includes("permission")) {
    const densePermissionOverlay = model.permissions.length > 8;
    const permissionCountByResource = new Map<string, number>();
    for (const permission of model.permissions) {
      const resource = permissionResourceId(permission);
      if (resource && nodeIds.has(resource)) {
        permissionCountByResource.set(resource, (permissionCountByResource.get(resource) ?? 0) + 1);
      }
    }
    for (const permission of model.permissions) {
      const resource = permissionResourceId(permission);
      const principalNodes = [
        ...(nodeByPrincipal.get(permission.principal) ?? []),
        ...(identityAttachment.get(permission.principal) ?? []),
      ].filter((id, index, ids) => nodeIds.has(id) && ids.indexOf(id) === index);
      addAll(nodes, principalNodes);
      if (resource && nodeIds.has(resource)) {
        nodes.add(resource);
        const label = permissionLabel(permission);
        if (!densePermissionOverlay && (permissionCountByResource.get(resource) ?? 0) <= 2) {
          setBadge(badges, resource, label);
        }
        for (const from of principalNodes) {
          if (from === resource) continue;
          const pairKey = from < resource ? `${from}\t${resource}` : `${resource}\t${from}`;
          const existing = edgesByNodePair.get(pairKey);
          if (existing?.length) {
            addAll(edges, existing);
            continue;
          }
          overlayEdges.push({
            id: `permission:${permission.id}:${from}->${resource}`,
            from,
            to: resource,
            label,
            className: "archmap-overlay-edge archmap-permission-edge",
          });
        }
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
    edgeBadges: edgeBadges.size ? edgeBadges : undefined,
    overlayEdges: overlayEdges.length ? overlayEdges : undefined,
    boxGroups: boxGroups.length ? boxGroups : undefined,
  };
}
