import type {
  ArchMapModel,
  Diagnostic,
  DiagnosticKind,
  DiagnosticLevel,
  DiagnosticSeverity,
} from "./types.js";

const REGISTRY_LEVELS: Record<string, DiagnosticLevel> = {
  invalid_node_id: "error",
  duplicate_node: "error",
  invalid_yaml: "error",
  metadata_not_object: "error",
  edge_missing_endpoint: "error",
  edge_unknown_source: "error",
  edge_unknown_target: "error",
  zone_parent_conflict: "error",
  zone_cycle: "error",
  src_fetch_failed: "error",

  unknown_base_view: "warning",
  unknown_overlay: "warning",
  view_3d_unavailable: "warning",

  missing_direction: "info",
  inferred_protocol: "info",
  inferred_auth_token: "info",
  inferred_flow: "info",
  inferred_zone: "info",

  node_without_metadata: "suggestion",
  node_zone_unknown: "suggestion",
  auth_token_without_recipient: "suggestion",
  data_without_classification: "suggestion",
  dataflow_missing_storage: "suggestion",
  telemetry_without_data_classification: "suggestion",
  placement_ref_unknown: "suggestion",
};

function levelFor(diagnostic: Diagnostic): DiagnosticLevel {
  return diagnostic.level ?? REGISTRY_LEVELS[diagnostic.code] ?? diagnostic.severity;
}

function severityFor(level: DiagnosticLevel): DiagnosticSeverity {
  return level === "error" ? "error" : level === "warning" ? "warning" : "info";
}

function normalizeDiagnostic(diagnostic: Diagnostic): Diagnostic {
  const level = levelFor(diagnostic);
  diagnostic.level = level;
  diagnostic.severity = severityFor(level);
  if (!diagnostic.target && diagnostic.ref) {
    diagnostic.target = { type: diagnostic.ref.kind, id: diagnostic.ref.id };
  }
  return diagnostic;
}

export function diagnostic(
  code: string,
  message: string,
  target?: { type: DiagnosticKind; id: string },
  level?: DiagnosticLevel,
): Diagnostic {
  const resolvedLevel = level ?? REGISTRY_LEVELS[code] ?? "warning";
  return {
    level: resolvedLevel,
    severity: severityFor(resolvedLevel),
    code,
    message,
    ref: target && target.type !== "view" ? { kind: target.type, id: target.id } : undefined,
    target,
  };
}

export function syncDiagnostics(model: ArchMapModel): void {
  const diagnostics = [
    ...model.errors,
    ...model.warnings,
    ...model.suggestions,
    ...model.infos,
  ].map(normalizeDiagnostic);

  model.diagnostics = diagnostics;
  model.errors = diagnostics.filter((d) => d.level === "error");
  model.warnings = diagnostics.filter((d) => d.level === "warning");
  model.suggestions = diagnostics.filter((d) => d.level === "suggestion");
  model.infos = diagnostics.filter((d) => d.level === "info");
}
