import type {
  ArchEdge,
  ArchMapModel,
  ArchNode,
  Boundary,
  DataObject,
  Diagnostic,
  DiagnosticKind,
  Identity,
  Permission,
  Zone,
} from "./types.js";
import { syncDiagnostics } from "./diagnostics.js";
import { escapeXml } from "./views/svg.js";

export type InspectableKind = Exclude<DiagnosticKind, "view"> | "diagnostic";

export interface InspectorSelection {
  type: InspectableKind;
  id: string;
}

export interface InspectorField {
  label: string;
  value: unknown;
}

export interface InspectorDetails {
  selection: InspectorSelection;
  title: string;
  fields: InspectorField[];
  diagnostics: Diagnostic[];
}

function scalar(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value.length ? value.join(", ") : undefined;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function push(fields: InspectorField[], label: string, value: unknown): void {
  if (scalar(value) !== undefined) fields.push({ label, value });
}

function diagnosticMatches(diagnostic: Diagnostic, type: DiagnosticKind, id: string): boolean {
  return diagnostic.target?.type === type && diagnostic.target.id === id
    || diagnostic.ref?.kind === type && diagnostic.ref.id === id;
}

function diagnosticsFor(model: ArchMapModel, type: DiagnosticKind, id: string): Diagnostic[] {
  syncDiagnostics(model);
  return model.diagnostics.filter((d) => diagnosticMatches(d, type, id));
}

function permissionsForNode(model: ArchMapModel, node: ArchNode): Permission[] {
  return model.permissions.filter((permission) => {
    const resource = typeof permission.resource === "string" ? permission.resource : permission.resource.id;
    return resource === node.id || permission.principal === node.id || permission.principal === node.principal;
  });
}

function identitiesForNode(model: ArchMapModel, node: ArchNode): Identity[] {
  return model.identities.filter((identity) => {
    const attached = identity.attachedTo;
    return Array.isArray(attached) ? attached.includes(node.id) : attached === node.id;
  });
}

function dataForNode(model: ArchMapModel, node: ArchNode): DataObject[] {
  return model.data.filter((data) => data.storedIn?.includes(node.id) || data.processedBy?.includes(node.id));
}

function crossingEdgesForBoundary(model: ArchMapModel, boundary: Boundary): ArchEdge[] {
  return model.edges.filter((edge) => edge.boundaryCrossing?.crosses.includes(boundary.id));
}

function childZones(model: ArchMapModel, zone: Zone): Zone[] {
  return model.zones.filter((candidate) => candidate.parent === zone.id);
}

function containedNodes(zone: Zone): string[] {
  return (zone.resolvedContains ?? [])
    .filter((entry) => entry.type === "node")
    .map((entry) => entry.id);
}

function containedZones(zone: Zone): string[] {
  return (zone.resolvedContains ?? [])
    .filter((entry) => entry.type === "zone")
    .map((entry) => entry.id);
}

function inspectNode(model: ArchMapModel, node: ArchNode): InspectorDetails {
  const fields: InspectorField[] = [];
  push(fields, "id", node.id);
  push(fields, "label", node.label);
  push(fields, "zone", node.zone);
  push(fields, "resolved zone", node.resolvedZone);
  push(fields, "layer", node.layer);
  push(fields, "kind", node.kind);
  push(fields, "provider", node.provider);
  push(fields, "principal", node.principal);
  push(fields, "placement", node.placement);
  push(fields, "tags", node.tags);
  push(fields, "description", node.description);
  push(fields, "stored data", model.data.filter((data) => data.storedIn?.includes(node.id)).map((data) => data.id));
  push(fields, "processed data", model.data.filter((data) => data.processedBy?.includes(node.id)).map((data) => data.id));
  push(fields, "attached identities", identitiesForNode(model, node).map((identity) => identity.id));
  push(fields, "related permissions", permissionsForNode(model, node).map((permission) => permission.id));
  push(fields, "related data", dataForNode(model, node).map((data) => data.id));
  push(fields, "inferred fields", node.inferred);
  const diagnostics = diagnosticsFor(model, "node", node.id);
  return { selection: { type: "node", id: node.id }, title: node.label || node.id, fields, diagnostics };
}

function inspectEdge(model: ArchMapModel, edge: ArchEdge): InspectorDetails {
  const fields: InspectorField[] = [];
  push(fields, "id", edge.id);
  push(fields, "from", edge.from);
  push(fields, "to", edge.to);
  push(fields, "label", edge.label);
  push(fields, "graph label", edge.graphLabel);
  push(fields, "flow", edge.flow);
  push(fields, "protocol", edge.protocol);
  push(fields, "auth", edge.auth);
  push(fields, "data", edge.dataIds);
  push(fields, "principal", edge.principal);
  push(fields, "networkPath", edge.networkPath);
  push(fields, "boundaryCrossing", edge.boundaryCrossing);
  push(fields, "inferred fields", edge.inferred);
  const diagnostics = diagnosticsFor(model, "edge", edge.id);
  return { selection: { type: "edge", id: edge.id }, title: edge.label || edge.id, fields, diagnostics };
}

function inspectZone(model: ArchMapModel, zone: Zone): InspectorDetails {
  const fields: InspectorField[] = [];
  push(fields, "id", zone.id);
  push(fields, "label", zone.label);
  push(fields, "kind", zone.kind);
  push(fields, "provider", zone.provider);
  push(fields, "parent", zone.parent);
  push(fields, "child zones", childZones(model, zone).map((child) => child.id).concat(containedZones(zone)));
  push(fields, "contained nodes", containedNodes(zone));
  push(fields, "owner", zone.owner);
  push(fields, "trust level", zone.trustLevel);
  push(fields, "description", zone.description);
  const diagnostics = diagnosticsFor(model, "zone", zone.id);
  return { selection: { type: "zone", id: zone.id }, title: zone.label || zone.id, fields, diagnostics };
}

function inspectBoundary(model: ArchMapModel, boundary: Boundary): InspectorDetails {
  const fields: InspectorField[] = [];
  push(fields, "id", boundary.id);
  push(fields, "label", boundary.label);
  push(fields, "kind", boundary.kind);
  push(fields, "contains", boundary.resolvedContains?.map((entry) => `${entry.type}:${entry.id}`) ?? boundary.contains);
  push(fields, "related zone", boundary.zone);
  push(fields, "crossing edges", crossingEdgesForBoundary(model, boundary).map((edge) => edge.id));
  push(fields, "description", boundary.description);
  const diagnostics = diagnosticsFor(model, "boundary", boundary.id);
  return { selection: { type: "boundary", id: boundary.id }, title: boundary.label || boundary.id, fields, diagnostics };
}

function inspectData(model: ArchMapModel, data: DataObject): InspectorDetails {
  const fields: InspectorField[] = [];
  push(fields, "id", data.id);
  push(fields, "label", data.label);
  push(fields, "classification", data.classification);
  push(fields, "stored in", data.storedIn);
  push(fields, "processed by", data.processedBy);
  push(fields, "flows", data.flows);
  push(fields, "storage", data.storage);
  push(fields, "retention", data.retention);
  push(fields, "description", data.description);
  const diagnostics = diagnosticsFor(model, "data", data.id);
  return { selection: { type: "data", id: data.id }, title: data.label || data.id, fields, diagnostics };
}

function inspectPermission(model: ArchMapModel, permission: Permission): InspectorDetails {
  const fields: InspectorField[] = [];
  push(fields, "id", permission.id);
  push(fields, "principal", permission.principal);
  push(fields, "action", permission.action);
  push(fields, "resource", permission.resource);
  push(fields, "effect", permission.effect);
  push(fields, "role", permission.role);
  push(fields, "condition", permission.condition);
  push(fields, "description", permission.description);
  const diagnostics = diagnosticsFor(model, "permission", permission.id);
  return { selection: { type: "permission", id: permission.id }, title: permission.id, fields, diagnostics };
}

function inspectIdentity(model: ArchMapModel, identity: Identity): InspectorDetails {
  const fields: InspectorField[] = [];
  push(fields, "id", identity.id);
  push(fields, "kind", identity.kind);
  push(fields, "provider", identity.provider);
  push(fields, "attached to", identity.attachedTo);
  push(fields, "description", identity.description);
  const diagnostics = diagnosticsFor(model, "identity", identity.id);
  return { selection: { type: "identity", id: identity.id }, title: identity.id, fields, diagnostics };
}

function inspectDiagnostic(model: ArchMapModel, id: string): InspectorDetails | undefined {
  syncDiagnostics(model);
  const diagnostic = model.diagnostics[Number(id)] ?? model.diagnostics.find((d) => d.code === id);
  if (!diagnostic) return undefined;
  const fields: InspectorField[] = [];
  push(fields, "level", diagnostic.level ?? diagnostic.severity);
  push(fields, "code", diagnostic.code);
  push(fields, "message", diagnostic.message);
  push(fields, "target", diagnostic.target);
  push(fields, "ref", diagnostic.ref);
  return { selection: { type: "diagnostic", id }, title: diagnostic.code, fields, diagnostics: [diagnostic] };
}

export function inspectModelElement(model: ArchMapModel, selection: InspectorSelection): InspectorDetails | undefined {
  switch (selection.type) {
    case "node": {
      const node = model.nodes.find((entry) => entry.id === selection.id);
      return node ? inspectNode(model, node) : undefined;
    }
    case "edge": {
      const edge = model.edges.find((entry) => entry.id === selection.id);
      return edge ? inspectEdge(model, edge) : undefined;
    }
    case "zone": {
      const zone = model.zones.find((entry) => entry.id === selection.id);
      return zone ? inspectZone(model, zone) : undefined;
    }
    case "boundary": {
      const boundary = model.boundaries.find((entry) => entry.id === selection.id);
      return boundary ? inspectBoundary(model, boundary) : undefined;
    }
    case "data": {
      const data = model.data.find((entry) => entry.id === selection.id);
      return data ? inspectData(model, data) : undefined;
    }
    case "permission": {
      const permission = model.permissions.find((entry) => entry.id === selection.id);
      return permission ? inspectPermission(model, permission) : undefined;
    }
    case "identity": {
      const identity = model.identities.find((entry) => entry.id === selection.id);
      return identity ? inspectIdentity(model, identity) : undefined;
    }
    case "diagnostic":
      return inspectDiagnostic(model, selection.id);
  }
}

function fieldHtml(field: InspectorField): string {
  const value = scalar(field.value);
  if (value === undefined) return "";
  return (
    `<dt>${escapeXml(field.label)}</dt>` +
    `<dd>${escapeXml(value)}</dd>`
  );
}

export function inspectorHtml(model: ArchMapModel, selection: InspectorSelection | null | undefined): string {
  const details = selection ? inspectModelElement(model, selection) : undefined;
  if (!details) {
    return `<div class="archmap-inspector" role="complementary"><p class="archmap-inspector-empty">No selection</p></div>`;
  }
  const fields = details.fields.map(fieldHtml).join("");
  const diagnostics = details.diagnostics
    .map((d) => `<li class="archmap-inspector-diagnostic archmap-diagnostic-${escapeXml(d.level ?? d.severity)}"><strong>${escapeXml(d.code)}</strong>: ${escapeXml(d.message)}</li>`)
    .join("");
  return (
    `<div class="archmap-inspector" role="complementary" data-type="${escapeXml(details.selection.type)}" data-id="${escapeXml(details.selection.id)}">` +
    `<h3>${escapeXml(details.title)}</h3>` +
    `<dl>${fields}</dl>` +
    `<div class="archmap-inspector-diagnostics"><strong>diagnostics</strong><ul>${diagnostics || "<li>none</li>"}</ul></div>` +
    `</div>`
  );
}

export function renderInspector(model: ArchMapModel, selection: InspectorSelection | null | undefined, target: Element | string | null | undefined): string {
  const html = inspectorHtml(model, selection);
  const el = typeof target === "string"
    ? typeof document !== "undefined" ? document.querySelector(target) ?? undefined : undefined
    : target ?? undefined;
  if (el && "innerHTML" in el) el.innerHTML = html;
  return html;
}
