/**
 * Model validation (§23). Errors not already caught during parsing are added
 * here (notably edges referencing unknown nodes), along with all warnings.
 *
 * Mutates and returns the model's diagnostics and derived level arrays.
 */

import { diagnostic, syncDiagnostics } from "./diagnostics.js";
import type { ArchMapModel } from "./types.js";
import {
  STANDARD_BOUNDARY_KINDS,
  STANDARD_DATA_CLASSIFICATIONS,
  STANDARD_FLOWS,
  STANDARD_IDENTITY_KINDS,
  STANDARD_KINDS,
  STANDARD_LAYERS,
  STANDARD_ZONE_KINDS,
} from "./types.js";

const TOKEN_REQUIRED_FLOWS = new Set(["token_issue", "token_validate"]);
const TOKEN_VALIDATOR_REQUIRED_FLOWS = new Set(["request", "request_response", "token_validate"]);
const TELEMETRY_FLOWS = new Set(["monitoring", "logging", "telemetry_export", "metrics_export", "log_export", "trace_export"]);
const SCREENFLOW_NODE_KINDS = new Set([
  "screen", "page", "modal", "webview", "form", "external_page", "error_screen", "completion_screen",
]);
const SCREENFLOW_FLOW_KINDS = new Set([
  "navigate", "submit", "back", "redirect", "deep_link", "open_modal",
  "close_modal", "switch_tab", "auth_check", "api_call", "success", "error", "auto",
]);
const EXTERNAL_ZONE_KINDS = new Set(["external", "internet", "saas", "partner", "onprem"]);
const FREEFORM_PLACEMENT_KEYS = new Set([
  "provider", "cloud", "folder", "project", "account", "region", "zone",
  "network", "subnet", "cluster", "fleet", "namespace", "environment",
]);

function isScreenflow(model: ArchMapModel): boolean {
  return model.mode === "screenflow" || model.profile === "screenflow";
}

function isUnsafeImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase();
  if (!scheme) return false;
  return !new Set(["http", "https", "blob"]).has(scheme);
}

function screenStepResolver(edges: ArchMapModel["edges"], diagnostics: ArchMapModel["errors"]): (ref: string) => string | undefined {
  const byId = new Map(edges.map((edge) => [edge.id, edge]));
  const byPair = new Map<string, ArchMapModel["edges"]>();
  for (const edge of edges) {
    const key = edge.pairKey ?? `${edge.from}->${edge.to}`;
    byPair.set(key, [...(byPair.get(key) ?? []), edge]);
  }
  return (ref: string): string | undefined => {
    const edge = byId.get(ref);
    if (edge) return edge.id;
    const pair = byPair.get(ref);
    if (pair && pair.length === 1) return pair[0].id;
    if (pair && pair.length > 1) {
      diagnostics.push(diagnostic("edge_pair_ambiguous", `Scenario step "${ref}" matches ${pair.length} edges; use an explicit edge id.`, { type: "view", id: ref }));
      return ref;
    }
    return undefined;
  };
}

export function validate(model: ArchMapModel): ArchMapModel {
  const { errors, warnings, suggestions, infos } = model;
  const nodeIds = new Set(model.nodes.map((n) => n.id));
  const zoneIds = new Set(model.zones.map((z) => z.id));
  const boundaryIds = new Set(model.boundaries.map((b) => b.id));
  const identityIds = new Set(model.identities.map((i) => i.id));
  const edgeIds = new Set(model.edges.map((e) => e.id));
  const dataIds = new Set(model.data.map((d) => d.id));
  const principalIds = new Set(model.nodes.map((n) => n.principal).filter((p): p is string => !!p));
  const knownPlacementRefs = new Set([
    ...nodeIds,
    ...zoneIds,
    ...boundaryIds,
    ...identityIds,
  ]);

  // §23.1 — edges must reference known nodes.
  for (const e of model.edges) {
    if (!nodeIds.has(e.from)) {
      errors.push(diagnostic("edge_unknown_source", `Edge "${e.id}" references unknown source node "${e.from}".`, { type: "edge", id: e.id }));
    }
    if (!nodeIds.has(e.to)) {
      errors.push(diagnostic("edge_unknown_target", `Edge "${e.id}" references unknown target node "${e.to}".`, { type: "edge", id: e.id }));
    }
  }

  // §23.2 — node-level warnings.
  for (const n of model.nodes) {
    const hasMeta = n.zone || n.layer || n.kind || n.provider || n.principal || (n.tags && n.tags.length);
    if (!hasMeta) {
      warnings.push(diagnostic("node_without_metadata", `Node "${n.id}" has no metadata.`, { type: "node", id: n.id }));
    }
    if (n.kind && !STANDARD_KINDS.has(n.kind)) {
      warnings.push(diagnostic("unknown_node_kind", `Node "${n.id}" uses unknown kind "${n.kind}".`, { type: "node", id: n.id }));
    }
    if (n.layer && !STANDARD_LAYERS.has(n.layer)) {
      warnings.push(diagnostic("unknown_layer", `Node "${n.id}" uses unknown layer "${n.layer}".`, { type: "node", id: n.id }));
    }
    for (const [key, value] of Object.entries(n.placement ?? {})) {
      if (FREEFORM_PLACEMENT_KEYS.has(key)) continue;
      if (!knownPlacementRefs.has(value)) {
        suggestions.push(diagnostic("placement_ref_unknown", `Node "${n.id}" placement "${key}" references unknown modeled object "${value}".`, { type: "node", id: n.id }));
      }
    }
    for (const field of n.inferred ?? []) {
      if (field === "zone") {
        infos.push(diagnostic("inferred_zone", `Node "${n.id}" zone was inferred from placement.`, { type: "node", id: n.id }));
      }
    }
  }

  for (const z of model.zones) {
    if (z.kind && !STANDARD_ZONE_KINDS.has(z.kind)) {
      warnings.push(diagnostic("unknown_zone_kind", `Zone "${z.id}" uses unknown kind "${z.kind}".`, { type: "zone", id: z.id }));
    }
  }

  for (const i of model.identities) {
    if (i.kind && !STANDARD_IDENTITY_KINDS.has(i.kind)) {
      warnings.push(diagnostic("unknown_identity_kind", `Identity "${i.id}" uses unknown kind "${i.kind}".`, { type: "identity", id: i.id }));
    }
  }

  const zoneOf = new Map(model.nodes.map((n) => [n.id, n.resolvedZone === "unknown" ? undefined : n.resolvedZone ?? n.zone]));

  // §23.2 — edge-level warnings.
  for (const e of model.edges) {
    if (e.flow && !STANDARD_FLOWS.has(e.flow)) {
      warnings.push(diagnostic("unknown_flow", `Edge "${e.id}" uses unknown flow "${e.flow}".`, { type: "edge", id: e.id }));
    }
    if (e.auth?.token) {
      if (!e.auth.issuer) {
        warnings.push(diagnostic("auth_token_without_issuer", `Edge "${e.id}" carries a token but declares no issuer.`, { type: "edge", id: e.id }));
      }
      if (!e.auth.validatedBy && TOKEN_VALIDATOR_REQUIRED_FLOWS.has(e.flow ?? "request_response")) {
        warnings.push(diagnostic("auth_token_without_validator", `Edge "${e.id}" carries a token but declares no validatedBy.`, { type: "edge", id: e.id }));
      }
    }
    if (TOKEN_REQUIRED_FLOWS.has(e.flow ?? "") && !e.auth?.token) {
      warnings.push(diagnostic("auth_flow_without_token", `Edge "${e.id}" has flow ${e.flow} but declares no auth token.`, { type: "edge", id: e.id }));
    }
    if (e.flow === "token_issue" && !e.auth?.issuer) {
      warnings.push(diagnostic("auth_token_without_issuer", `Edge "${e.id}" issues a token but declares no issuer.`, { type: "edge", id: e.id }));
    }
    if (e.flow === "token_validate" && !e.auth?.validatedBy) {
      warnings.push(diagnostic("auth_token_without_validator", `Edge "${e.id}" validates a token but declares no validatedBy.`, { type: "edge", id: e.id }));
    }
    if (e.flow === "token_issue" && !e.auth?.recipient) {
      suggestions.push(diagnostic("auth_token_without_recipient", `Edge "${e.id}" issues a token but declares no recipient.`, { type: "edge", id: e.id }));
    }
    if (e.auth?.issuer && !nodeIds.has(e.auth.issuer)) {
      warnings.push(diagnostic("auth_unknown_issuer", `Edge "${e.id}" auth issuer references unknown node "${e.auth.issuer}".`, { type: "edge", id: e.id }));
    }
    if (e.auth?.validatedBy && !nodeIds.has(e.auth.validatedBy)) {
      warnings.push(diagnostic("auth_unknown_validator", `Edge "${e.id}" auth validator references unknown node "${e.auth.validatedBy}".`, { type: "edge", id: e.id }));
    }
    if (e.auth?.recipient && !nodeIds.has(e.auth.recipient)) {
      warnings.push(diagnostic("auth_unknown_recipient", `Edge "${e.id}" auth recipient references unknown node "${e.auth.recipient}".`, { type: "edge", id: e.id }));
    }
    const fromZone = zoneOf.get(e.from);
    const toZone = zoneOf.get(e.to);
    const crossesZone = fromZone !== undefined && toZone !== undefined && fromZone !== toZone;
    if (crossesZone && e.boundaryCrossing === undefined) {
      warnings.push(diagnostic("zone_crossing_without_boundary", `Edge "${e.id}" crosses zones (${fromZone} -> ${toZone}) but boundaryCrossing is missing.`, { type: "edge", id: e.id }));
    }
    if (crossesZone && e.boundaryCrossing?.assertedFalse) {
      warnings.push(diagnostic("zone_crossing_marked_false", `Edge "${e.id}" crosses zones (${fromZone} -> ${toZone}) but boundaryCrossing is false.`, { type: "edge", id: e.id }));
    }
    if (e.flow === "data_access" && !e.principal) {
      warnings.push(diagnostic("data_access_without_principal", `Edge "${e.id}" has flow data_access but no principal.`, { type: "edge", id: e.id }));
    }
    for (const field of e.inferred ?? []) {
      const code =
        field === "protocol" ? "inferred_protocol"
          : field === "flow" ? "inferred_flow"
            : field === "auth.token" ? "inferred_auth_token"
              : undefined;
      if (code) {
        infos.push(diagnostic(code, `Edge "${e.id}" ${field} was inferred from its label.`, { type: "edge", id: e.id }));
      }
    }
  }

  if (isScreenflow(model)) {
    const screenNodes = new Set(model.nodes
      .filter((node) => (node.kind && SCREENFLOW_NODE_KINDS.has(node.kind)) || node.image)
      .map((node) => node.id));
    const scenarioStarts = new Set(model.scenarios.map((scenario) => scenario.start).filter(Boolean));
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, ArchMapModel["edges"]>();
    for (const edge of model.edges) {
      incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
      outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
    }

    for (const node of model.nodes) {
      if (node.image && isUnsafeImageUrl(node.image)) {
        errors.push(diagnostic("image_url_disallowed", `Node "${node.id}" image URL uses a disallowed protocol.`, { type: "node", id: node.id }));
      }
      if (node.kind && SCREENFLOW_NODE_KINDS.has(node.kind) && !node.image) {
        suggestions.push(diagnostic("screen_node_without_image", `Screen node "${node.id}" has no image; Prototype View will render a fallback card.`, { type: "node", id: node.id }));
      }
      if (screenNodes.has(node.id) && !scenarioStarts.has(node.id) && (incoming.get(node.id) ?? 0) === 0) {
        suggestions.push(diagnostic("unreachable_screen", `Screen node "${node.id}" has no incoming transition and is not a scenario start.`, { type: "node", id: node.id }));
      }
    }

    for (const edge of model.edges) {
      const screenflowEdge = screenNodes.has(edge.from) || screenNodes.has(edge.to) || (edge.flow !== undefined && SCREENFLOW_FLOW_KINDS.has(edge.flow));
      if (screenflowEdge && !edge.trigger) {
        suggestions.push(diagnostic("transition_without_trigger", `ScreenFlow edge "${edge.id}" has no trigger.`, { type: "edge", id: edge.id }));
      }
      if (edge.hotspot) {
        const source = model.nodes.find((node) => node.id === edge.from);
        const frame = source?.frame;
        if (frame?.width !== undefined && frame.height !== undefined) {
          const out =
            edge.hotspot.x < 0 ||
            edge.hotspot.y < 0 ||
            edge.hotspot.width <= 0 ||
            edge.hotspot.height <= 0 ||
            edge.hotspot.x + edge.hotspot.width > frame.width ||
            edge.hotspot.y + edge.hotspot.height > frame.height;
          if (out) {
            warnings.push(diagnostic("hotspot_out_of_bounds", `Edge "${edge.id}" hotspot is outside source frame "${edge.from}".`, { type: "edge", id: edge.id }));
          }
        }
      }
      const to = model.nodes.find((node) => node.id === edge.to);
      const toZone = to ? model.zones.find((zone) => zone.id === (to.resolvedZone === "unknown" ? undefined : to.resolvedZone ?? to.zone)) : undefined;
      const externalTarget =
        to?.kind === "external_page" ||
        to?.kind === "webview" ||
        (toZone?.kind !== undefined && EXTERNAL_ZONE_KINDS.has(toZone.kind));
      if (screenflowEdge && externalTarget && edge.boundaryCrossing === undefined) {
        warnings.push(diagnostic("external_transition_without_boundary", `External transition "${edge.id}" has no boundaryCrossing declaration.`, { type: "edge", id: edge.id }));
      }
    }

    const resolveStep = screenStepResolver(model.edges, errors);
    for (const scenario of model.scenarios) {
      if (!nodeIds.has(scenario.start)) {
        errors.push(diagnostic("scenario_unknown_start", `Scenario "${scenario.id}" starts at unknown node "${scenario.start}".`, { type: "view", id: scenario.id }));
      }
      for (const step of scenario.steps) {
        if (!resolveStep(step)) {
          errors.push(diagnostic("scenario_unknown_step", `Scenario "${scenario.id}" references unknown transition "${step}".`, { type: "view", id: scenario.id }));
        }
      }
    }

    if (model.scenarios.length === 0) {
      for (const [from, edges] of outgoing) {
        if (screenNodes.has(from) && edges.length > 1) {
          suggestions.push(diagnostic("ambiguous_transition", `Screen "${from}" has ${edges.length} outgoing transitions and no scenario defines Next order.`, { type: "node", id: from }));
        }
      }
    }
  }

  // §23.2 — permissions.
  for (const p of model.permissions) {
    if (p.principal && !identityIds.has(p.principal) && !principalIds.has(p.principal)) {
      warnings.push(diagnostic("permission_unknown_principal", `Permission "${p.id}" references unknown principal "${p.principal}".`, { type: "permission", id: p.id }));
    }
    const resource = typeof p.resource === "string" ? { type: "node", id: p.resource } : p.resource;
    const knownResource =
      resource.type === "node" ? nodeIds.has(resource.id) :
      resource.type === "zone" ? zoneIds.has(resource.id) :
      resource.type === "boundary" ? boundaryIds.has(resource.id) :
      resource.type === "data" ? dataIds.has(resource.id) :
      false;
    if (resource.id && !knownResource) {
      warnings.push(diagnostic("permission_unknown_resource", `Permission "${p.id}" references unknown resource "${resource.type}:${resource.id}".`, { type: "permission", id: p.id }));
    }
  }

  // §23.2 — data objects.
  for (const d of model.data) {
    if (!d.classification) {
      suggestions.push(diagnostic("data_without_classification", `Data object "${d.id}" has no classification.`, { type: "data", id: d.id }));
    } else if (!STANDARD_DATA_CLASSIFICATIONS.has(d.classification)) {
      warnings.push(diagnostic("unknown_classification", `Data object "${d.id}" uses unknown classification "${d.classification}".`, { type: "data", id: d.id }));
    }
    if ((d.flows?.length ?? 0) > 0 && d.storage !== "transient" && d.storedIn === undefined) {
      suggestions.push(diagnostic("dataflow_missing_storage", `Data object "${d.id}" has flows but no storage declaration.`, { type: "data", id: d.id }));
    }
    for (const f of d.flows ?? []) {
      if (!edgeIds.has(f)) {
        warnings.push(diagnostic("data_unknown_flow", `Data object "${d.id}" references unknown flow "${f}".`, { type: "data", id: d.id }));
      }
    }
    for (const s of d.storedIn ?? []) {
      if (!nodeIds.has(s)) {
        warnings.push(diagnostic("data_unknown_node", `Data object "${d.id}" references unknown node "${s}".`, { type: "data", id: d.id }));
      }
    }
    for (const p of d.processedBy ?? []) {
      if (!nodeIds.has(p)) {
        warnings.push(diagnostic("data_unknown_node", `Data object "${d.id}" references unknown processing node "${p}".`, { type: "data", id: d.id }));
      }
    }
  }

  // §23.2 — zones / boundaries containing unknown references.
  for (const z of model.zones) {
    for (const id of z.contains ?? []) {
      if (!nodeIds.has(id) && !zoneIds.has(id)) {
        const looksLikeZone = /zone|vpc|subnet|network|project|account|env|region|cluster|boundary/i.test(id);
        warnings.push(diagnostic(
          looksLikeZone ? "zone_unknown_child_zone" : "zone_unknown_node",
          looksLikeZone
            ? `Zone "${z.id}" contains unknown child zone "${id}".`
            : `Zone "${z.id}" contains unknown node "${id}".`,
          { type: "zone", id: z.id },
        ));
      }
    }
  }
  for (const b of model.boundaries) {
    if (b.kind && !STANDARD_BOUNDARY_KINDS.has(b.kind)) {
      warnings.push(diagnostic("unknown_boundary_kind", `Boundary "${b.id}" uses unknown kind "${b.kind}".`, { type: "boundary", id: b.id }));
    }
    if (b.zone && !zoneIds.has(b.zone)) {
      warnings.push(diagnostic("boundary_unknown_related_zone", `Boundary "${b.id}" references unknown related zone "${b.zone}".`, { type: "boundary", id: b.id }));
    }
    for (const id of b.contains ?? []) {
      if (!boundaryIds.has(id) && !zoneIds.has(id) && !nodeIds.has(id)) {
        const code = /boundary/i.test(id)
          ? "boundary_unknown_boundary"
          : /zone|vpc|subnet|network|project|account|env|region|cluster/i.test(id)
            ? "boundary_unknown_zone"
            : "boundary_unknown_node";
        const noun = code === "boundary_unknown_boundary" ? "boundary" : code === "boundary_unknown_zone" ? "zone" : "node";
        warnings.push(diagnostic(code, `Boundary "${b.id}" contains unknown ${noun} "${id}".`, { type: "boundary", id: b.id }));
      }
    }
  }
  emitBoundaryCycleDiagnostics(model, warnings);

  for (const e of model.edges) {
    if (e.flow && TELEMETRY_FLOWS.has(e.flow) && (e.dataIds?.length ?? 0) === 0) {
      suggestions.push(diagnostic("telemetry_without_data_classification", `Telemetry-like edge "${e.id}" has no data classification context.`, { type: "edge", id: e.id }));
    }
  }

  syncDiagnostics(model);
  return model;
}

function emitBoundaryCycleDiagnostics(model: ArchMapModel, diagnostics: ArchMapModel["warnings"]): void {
  const childBoundaryIds = new Map<string, string[]>();
  const boundaryIds = new Set(model.boundaries.map((b) => b.id));
  for (const b of model.boundaries) {
    for (const child of b.resolvedContains ?? []) {
      if (child.type !== "boundary" || !boundaryIds.has(child.id)) continue;
      const parents = childBoundaryIds.get(child.id) ?? [];
      parents.push(b.id);
      childBoundaryIds.set(child.id, parents);
    }
  }

  const emitted = new Set<string>();
  for (const start of boundaryIds) {
    const seen = new Map<string, number>();
    let current: string | undefined = start;
    while (current) {
      const previous = seen.get(current);
      if (previous !== undefined) {
        const cycle = [...seen.keys()].slice(previous);
        const key = [...cycle].sort().join(">");
        if (!emitted.has(key)) {
          emitted.add(key);
          diagnostics.push(diagnostic("boundary_cycle", `Boundary nesting contains a cycle: ${cycle.join(" -> ")} -> ${current}.`, { type: "boundary", id: current }, "error"));
        }
        break;
      }
      seen.set(current, seen.size);
      current = childBoundaryIds.get(current)?.[0];
    }
  }
}
