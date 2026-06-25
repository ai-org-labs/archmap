/**
 * Model validation (§23). Errors not already caught during parsing are added
 * here (notably edges referencing unknown nodes), along with all warnings.
 *
 * Mutates and returns the model's `errors` / `warnings` arrays.
 */

import type { ArchMapModel } from "./types.js";
import { STANDARD_FLOWS, STANDARD_KINDS, STANDARD_LAYERS } from "./types.js";

export function validate(model: ArchMapModel): ArchMapModel {
  const { errors, warnings } = model;
  const nodeIds = new Set(model.nodes.map((n) => n.id));
  const identityIds = new Set(model.identities.map((i) => i.id));
  const edgeIds = new Set(model.edges.map((e) => e.id));

  // §23.1 — edges must reference known nodes.
  for (const e of model.edges) {
    if (!nodeIds.has(e.from)) {
      errors.push({ severity: "error", code: "edge_unknown_source", message: `Edge "${e.id}" references unknown source node "${e.from}".`, ref: { kind: "edge", id: e.id } });
    }
    if (!nodeIds.has(e.to)) {
      errors.push({ severity: "error", code: "edge_unknown_target", message: `Edge "${e.id}" references unknown target node "${e.to}".`, ref: { kind: "edge", id: e.id } });
    }
  }

  // §23.2 — node-level warnings.
  for (const n of model.nodes) {
    const hasMeta = n.zone || n.layer || n.kind || n.provider || n.principal || (n.tags && n.tags.length);
    if (!hasMeta) {
      warnings.push({ severity: "warning", code: "node_without_metadata", message: `Node "${n.id}" has no metadata.`, ref: { kind: "node", id: n.id } });
    }
    if (n.kind && !STANDARD_KINDS.has(n.kind)) {
      warnings.push({ severity: "warning", code: "unknown_kind", message: `Node "${n.id}" uses unknown kind "${n.kind}".`, ref: { kind: "node", id: n.id } });
    }
    if (n.layer && !STANDARD_LAYERS.has(n.layer)) {
      warnings.push({ severity: "warning", code: "unknown_layer", message: `Node "${n.id}" uses unknown layer "${n.layer}".`, ref: { kind: "node", id: n.id } });
    }
  }

  const zoneOf = new Map(model.nodes.map((n) => [n.id, n.zone]));

  // §23.2 — edge-level warnings.
  for (const e of model.edges) {
    if (e.flow && !STANDARD_FLOWS.has(e.flow)) {
      warnings.push({ severity: "warning", code: "unknown_flow", message: `Edge "${e.id}" uses unknown flow "${e.flow}".`, ref: { kind: "edge", id: e.id } });
    }
    if (e.auth?.token) {
      if (!e.auth.issuer) {
        warnings.push({ severity: "warning", code: "auth_token_without_issuer", message: `Edge "${e.id}" carries a token but declares no issuer.`, ref: { kind: "edge", id: e.id } });
      }
      if (!e.auth.validatedBy) {
        warnings.push({ severity: "warning", code: "auth_token_without_validator", message: `Edge "${e.id}" carries a token but declares no validatedBy.`, ref: { kind: "edge", id: e.id } });
      }
    }
    const fromZone = zoneOf.get(e.from);
    const toZone = zoneOf.get(e.to);
    const crossesZone = fromZone !== undefined && toZone !== undefined && fromZone !== toZone;
    if (crossesZone && e.boundaryCrossing === undefined) {
      warnings.push({ severity: "warning", code: "zone_crossing_without_boundary", message: `Edge "${e.id}" crosses zones (${fromZone} → ${toZone}) but boundaryCrossing is missing.`, ref: { kind: "edge", id: e.id } });
    }
    if (e.flow === "data_access" && !e.principal) {
      warnings.push({ severity: "warning", code: "data_access_without_principal", message: `Edge "${e.id}" has flow data_access but no principal.`, ref: { kind: "edge", id: e.id } });
    }
  }

  // §23.2 — permissions.
  for (const p of model.permissions) {
    if (p.principal && !identityIds.has(p.principal)) {
      warnings.push({ severity: "warning", code: "permission_unknown_principal", message: `Permission "${p.id}" references unknown principal "${p.principal}".`, ref: { kind: "permission", id: p.id } });
    }
    if (p.resource && !nodeIds.has(p.resource)) {
      warnings.push({ severity: "warning", code: "permission_unknown_resource", message: `Permission "${p.id}" references unknown resource "${p.resource}".`, ref: { kind: "permission", id: p.id } });
    }
  }

  // §23.2 — data objects.
  for (const d of model.data) {
    for (const f of d.flows ?? []) {
      if (!edgeIds.has(f)) {
        warnings.push({ severity: "warning", code: "data_unknown_flow", message: `Data object "${d.id}" references unknown flow "${f}".`, ref: { kind: "data", id: d.id } });
      }
    }
    for (const s of d.storedIn ?? []) {
      if (!nodeIds.has(s)) {
        warnings.push({ severity: "warning", code: "data_unknown_node", message: `Data object "${d.id}" references unknown node "${s}".`, ref: { kind: "data", id: d.id } });
      }
    }
  }

  // §23.2 — zones / boundaries containing unknown nodes.
  for (const z of model.zones) {
    for (const id of z.contains ?? []) {
      if (!nodeIds.has(id)) {
        warnings.push({ severity: "warning", code: "zone_unknown_node", message: `Zone "${z.id}" contains unknown node "${id}".`, ref: { kind: "zone", id: z.id } });
      }
    }
  }
  for (const b of model.boundaries) {
    const knownContainer = (id: string) => nodeIds.has(id) || model.boundaries.some((x) => x.id === id);
    for (const id of b.contains ?? []) {
      if (!knownContainer(id)) {
        warnings.push({ severity: "warning", code: "boundary_unknown_node", message: `Boundary "${b.id}" contains unknown node "${id}".`, ref: { kind: "boundary", id: b.id } });
      }
    }
  }

  return model;
}
