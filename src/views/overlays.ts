import type { LayoutResult } from "../layout.js";
import type { ArchMapModel, BoundaryCrossing, Diagnostic, GraphSubgraph, Permission } from "../types.js";
import type { Box } from "./base.js";
import { computePhasePresence, presenceInterval, timelinePhaseIndex } from "../time-projection.js";

export const OVERLAY_NAMES = new Set(["subgraph", "zone", "auth", "dataflow", "boundary", "permission", "validation", "timeline"]);

/** Extra context for overlays that depend on render state (v0.2 timeline). */
export interface OverlayContext {
  /** Active timeline phase id, when the render has one. */
  phase?: string;
}

export interface OverlayEdgeBadge {
  kind: "auth-summary" | "data-summary" | "boundary-summary" | "permission-summary" | "validation-summary";
  label: string;
  title?: string;
  level?: "error" | "warning" | "suggestion" | "info";
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

const BADGE_PRIORITY = {
  boundary: 10,
  data: 20,
  auth: 30,
  permission: 40,
  validation: 50,
  timeline: 60,
} as const;

function setBadge(
  badges: Map<string, string>,
  priorities: Map<string, number>,
  id: string,
  value: string,
  priority: number,
): void {
  if ((priorities.get(id) ?? -1) > priority) return;
  priorities.set(id, priority);
  badges.set(id, value);
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

function compactList(values: Array<string | undefined>, fallback: string, max = 2): string {
  const unique = [...new Set(values.filter((value): value is string => !!value))];
  if (unique.length === 0) return fallback;
  if (unique.length <= max) return unique.join(", ");
  return `${unique.slice(0, max).join(", ")} +${unique.length - max}`;
}

function badgePayload(prefix: string, label: string, title?: string): string {
  return title ? `${prefix}${label}\n${title}` : `${prefix}${label}`;
}

function primaryLevel(items: Diagnostic[]): "error" | "warning" | "suggestion" | "info" {
  if (items.some((diagnostic) => diagnostic.level === "error" || diagnostic.severity === "error")) return "error";
  if (items.some((diagnostic) => (diagnostic.level ?? diagnostic.severity) === "warning")) return "warning";
  if (items.some((diagnostic) => diagnostic.level === "suggestion")) return "suggestion";
  return "info";
}

function subgraphChildren(subgraphs: GraphSubgraph[]): Map<string | undefined, GraphSubgraph[]> {
  const out = new Map<string | undefined, GraphSubgraph[]>();
  for (const sg of subgraphs) {
    out.set(sg.parent, [...(out.get(sg.parent) ?? []), sg]);
  }
  return out;
}

function subgraphDepths(subgraphs: GraphSubgraph[]): Map<string, number> {
  const byId = new Map(subgraphs.map((sg) => [sg.id, sg]));
  const depths = new Map<string, number>();
  const depthOf = (sg: GraphSubgraph, seen = new Set<string>()): number => {
    if (depths.has(sg.id)) return depths.get(sg.id)!;
    if (!sg.parent || seen.has(sg.id) || !byId.has(sg.parent)) {
      depths.set(sg.id, 0);
      return 0;
    }
    seen.add(sg.id);
    const depth = depthOf(byId.get(sg.parent)!, seen) + 1;
    seen.delete(sg.id);
    depths.set(sg.id, depth);
    return depth;
  };
  for (const sg of subgraphs) depthOf(sg);
  return depths;
}

function subgraphMembers(sg: GraphSubgraph, childrenByParent: Map<string | undefined, GraphSubgraph[]>, nodeIds: Set<string>, seen = new Set<string>()): Set<string> {
  if (seen.has(sg.id)) return new Set();
  seen.add(sg.id);
  const out = new Set(sg.members.filter((id) => nodeIds.has(id)));
  for (const child of childrenByParent.get(sg.id) ?? []) {
    for (const id of subgraphMembers(child, childrenByParent, nodeIds, seen)) out.add(id);
  }
  seen.delete(sg.id);
  return out;
}

function subgraphBoxes(model: ArchMapModel, layout: LayoutResult): Box[] {
  const subgraphs = Object.values(model.graph.subgraphs);
  if (subgraphs.length === 0) return [];
  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
  const nodeIds = new Set(layout.nodes.map((node) => node.id));
  const childrenByParent = subgraphChildren(subgraphs);
  const depths = subgraphDepths(subgraphs);
  const pad = 20;
  const labelPad = 34;
  return subgraphs
    .map((sg): Box | undefined => {
      const members = [...subgraphMembers(sg, childrenByParent, nodeIds)].map((id) => nodesById.get(id)).filter((node): node is NonNullable<typeof node> => !!node);
      if (members.length === 0) return undefined;
      const minX = Math.min(...members.map((node) => node.x));
      const minY = Math.min(...members.map((node) => node.y));
      const maxX = Math.max(...members.map((node) => node.x + node.w));
      const maxY = Math.max(...members.map((node) => node.y + node.h));
      return {
        id: sg.id,
        label: sg.label ?? sg.id,
        depth: depths.get(sg.id) ?? 0,
        x: minX - pad,
        y: minY - labelPad,
        w: maxX - minX + pad * 2,
        h: maxY - minY + labelPad + pad,
      };
    })
    .filter((box): box is Box => !!box)
    .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
}

export function buildOverlayProjection(model: ArchMapModel, layout: LayoutResult, overlays: string[], context?: OverlayContext): OverlayProjection {
  const active = overlays.filter((overlay) => OVERLAY_NAMES.has(overlay));
  const nodes = new Set<string>();
  const edges = new Set<string>();
  const badges = new Map<string, string>();
  const edgeBadges = new Map<string, OverlayEdgeBadge[]>();
  const badgePriorities = new Map<string, number>();
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

  if (active.includes("subgraph")) {
    boxGroups.push({ boxes: subgraphBoxes(model, layout), boxClass: "archmap-subgraph" });
  }

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
        const crossesList = modelEdge?.boundaryCrossing?.crosses ?? [];
        const label = crossesList.length ? compactList(crossesList, "boundary", 1) : za && zb ? `${za} -> ${zb}` : "boundary";
        const title = [
          `edge: ${edge.from} -> ${edge.to}`,
          crossesList.length ? `boundaries: ${crossesList.join(", ")}` : undefined,
          za && zb && za !== zb ? `zones: ${za} -> ${zb}` : undefined,
        ].filter(Boolean).join("\n");
        edgeBadges.set(edge.id, [{ kind: "boundary-summary", label, title }]);
      }
    }
  }

  if (active.includes("dataflow")) {
    const dataById = new Map(model.data.map((data) => [data.id, data]));
    const dataIdsByEdge = new Map<string, Set<string>>();
    for (const edge of model.edges) {
      for (const dataId of edge.dataIds ?? []) {
        const set = dataIdsByEdge.get(edge.id) ?? new Set<string>();
        set.add(dataId);
        dataIdsByEdge.set(edge.id, set);
      }
    }
    for (const data of model.data) {
      for (const flow of data.flows ?? []) {
        const set = dataIdsByEdge.get(flow) ?? new Set<string>();
        set.add(data.id);
        dataIdsByEdge.set(flow, set);
      }
    }
    for (const node of model.nodes) {
      if (node.kind && STORAGE_KINDS.has(node.kind)) nodes.add(node.id);
    }
    for (const edge of model.edges) {
      const dataIds = [...(dataIdsByEdge.get(edge.id) ?? new Set<string>())];
      if ((edge.flow && DATA_FLOWS.has(edge.flow)) || dataIds.length > 0) {
        edges.add(edge.id);
        nodes.add(edge.from);
        nodes.add(edge.to);
        const dataObjects = dataIds.map((id) => dataById.get(id)).filter(Boolean);
        const classifications = dataObjects.map((data) => data?.classification);
        const labelParts = [
          compactList(dataIds, edge.flow ?? "data"),
          compactList(classifications, "", 1),
        ].filter(Boolean);
        const title = [
          edge.flow ? `flow: ${edge.flow}` : undefined,
          edge.protocol ? `protocol: ${edge.protocol}` : undefined,
          dataObjects.length ? `data: ${dataObjects.map((data) => data?.label ?? data?.id).join(", ")}` : undefined,
          classifications.some(Boolean) ? `classification: ${compactList(classifications, "", 4)}` : undefined,
        ].filter(Boolean).join("\n");
        edgeBadges.set(edge.id, [{ kind: "data-summary", label: labelParts[0] ?? edge.flow ?? "data", title }]);
      }
    }
    for (const data of model.data) {
      for (const id of data.storedIn ?? []) {
        nodes.add(id);
        const label = data.classification ?? data.label ?? data.id;
        const title = [
          `data: ${data.label ?? data.id}`,
          data.classification ? `classification: ${data.classification}` : undefined,
          data.retention ? `retention: ${data.retention}` : undefined,
        ].filter(Boolean).join("\n");
        setBadge(badges, badgePriorities, id, badgePayload("data:", label, title), BADGE_PRIORITY.data);
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
      const label = edge.auth?.token ?? edge.auth?.method ?? "auth";
      if (edge.auth?.token) {
        setBadge(badges, badgePriorities, edge.to, `auth:${edge.auth.token}`, BADGE_PRIORITY.auth);
      }
      if (title) edgeBadges.set(edge.id, [{ kind: "auth-summary", label, title }]);
    }
  }

  if (active.includes("permission")) {
    const permissionCountByResource = new Map<string, number>();
    const permissionLabelsByResource = new Map<string, string[]>();
    for (const permission of model.permissions) {
      const resource = permissionResourceId(permission);
      if (resource && nodeIds.has(resource)) {
        permissionCountByResource.set(resource, (permissionCountByResource.get(resource) ?? 0) + 1);
        permissionLabelsByResource.set(resource, [...(permissionLabelsByResource.get(resource) ?? []), permissionLabel(permission)]);
      }
    }
    for (const [resource, labels] of permissionLabelsByResource) {
      const count = labels.length;
      const title = labels.map((label, i) => `${i + 1}. ${label}`).join("\n");
      setBadge(
        badges,
        badgePriorities,
        resource,
        badgePayload("permission:", count === 1 ? "1 permission" : `${count} permissions`, title),
        BADGE_PRIORITY.permission,
      );
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
        for (const from of principalNodes) {
          if (from === resource) continue;
          const pairKey = from < resource ? `${from}\t${resource}` : `${resource}\t${from}`;
          const existing = edgesByNodePair.get(pairKey);
          if (existing?.length) {
            addAll(edges, existing);
            const title = [
              `principal: ${permission.principal}`,
              `resource: ${resource}`,
              permission.action ? `action: ${permission.action}` : undefined,
              permission.effect ? `effect: ${permission.effect}` : undefined,
              permission.role ? `role: ${permission.role}` : undefined,
            ].filter(Boolean).join("\n");
            for (const edgeId of existing) {
              edgeBadges.set(edgeId, [{ kind: "permission-summary", label, title }]);
            }
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
    const diagnostics = model.diagnostics.length ? model.diagnostics : [...model.errors, ...model.warnings];
    const diagnosticsByTarget = new Map<string, typeof diagnostics>();
    for (const diagnostic of diagnostics) {
      const target = diagnostic.target ?? (diagnostic.ref ? { type: diagnostic.ref.kind, id: diagnostic.ref.id } : undefined);
      if (!target) continue;
      const key = `${target.type}:${target.id}`;
      diagnosticsByTarget.set(key, [...(diagnosticsByTarget.get(key) ?? []), diagnostic]);
      if (target.type === "node") {
        nodes.add(target.id);
      } else if (target.type === "edge") {
        edges.add(target.id);
      }
    }
    for (const [key, items] of diagnosticsByTarget) {
      const [type, id] = key.split(":");
      const errors = items.filter((diagnostic) => diagnostic.level === "error" || diagnostic.severity === "error").length;
      const warnings = items.filter((diagnostic) => (diagnostic.level ?? diagnostic.severity) === "warning").length;
      const suggestions = items.filter((diagnostic) => diagnostic.level === "suggestion").length;
      const level = primaryLevel(items);
      const label = errors ? `${errors} error${errors > 1 ? "s" : ""}`
        : warnings ? `${warnings} warning${warnings > 1 ? "s" : ""}`
          : suggestions ? `${suggestions} suggestion${suggestions > 1 ? "s" : ""}`
            : `${items.length} info`;
      const title = items.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n");
      if (type === "node") {
        setBadge(badges, badgePriorities, id, badgePayload(`validation:${level}:`, label, title), BADGE_PRIORITY.validation);
      } else if (type === "edge") {
        edgeBadges.set(id, [{ kind: "validation-summary", label, title, level }]);
      }
    }
  }

  // Timeline overlay (v0.2 4D): the "what changes at this phase" lens. It
  // emphasizes elements whose presence or state changes at the active phase
  // and badges lifecycle transitions. Ghost/state classes themselves are not
  // gated on this overlay — they apply whenever a phase is active.
  if (active.includes("timeline") && context?.phase && model.timeline) {
    const presence = computePhasePresence(model, context.phase);
    if (presence) {
      const phaseIndex = timelinePhaseIndex(model.timeline);
      const idx = presence.phaseIndex;
      const phases = model.timeline.phases;
      const phaseName = (index: number): string => phases[index]?.label ?? phases[index]?.id ?? "";
      const lifecycleTitle = (lifecycle: { added?: string; removed?: string }): string => {
        const parts: string[] = [];
        if (lifecycle.added) parts.push(`added: ${lifecycle.added}`);
        if (lifecycle.removed) parts.push(`removed: ${lifecycle.removed}`);
        return parts.join(" / ");
      };
      for (const node of model.nodes) {
        if (!node.lifecycle) continue;
        const interval = presenceInterval(node.lifecycle, phaseIndex);
        const labels: string[] = [];
        if (interval.addedIndex === idx && interval.addedIndex > 0) labels.push(`+ ${phaseName(idx)}`);
        if (Number.isFinite(interval.removedIndex) && interval.removedIndex === idx + 1) labels.push(`- ${phaseName(interval.removedIndex)}`);
        const state = presence.nodeStates.get(node.id);
        if (state) labels.push(state);
        if (labels.length === 0) continue;
        nodes.add(node.id);
        setBadge(badges, badgePriorities, node.id, badgePayload("", labels.join(" · "), lifecycleTitle(node.lifecycle)), BADGE_PRIORITY.timeline);
      }
      for (const edge of model.edges) {
        if (!edge.lifecycle) continue;
        const interval = presenceInterval(edge.lifecycle, phaseIndex);
        const changesNow = (interval.addedIndex === idx && interval.addedIndex > 0) ||
          (Number.isFinite(interval.removedIndex) && interval.removedIndex === idx + 1) ||
          presence.edgeStates.has(edge.id);
        if (changesNow && !presence.absentEdges.has(edge.id)) edges.add(edge.id);
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
