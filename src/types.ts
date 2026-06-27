/**
 * ArchMap internal model (spec §28) and shared vocabulary (§9, §10, §13).
 *
 * The model is the normalized output of the parser. Every view renders from
 * this shape, and a future GUI editor exports back to DSL from it.
 */

export const ARCHMAP_VERSION = "0.1.0";

export type Direction = "LR" | "TD";

export type NodeShape = "rectangle" | "database" | "circle" | "diamond";

export type DiagnosticSeverity = "error" | "warning" | "info";
export type DiagnosticLevel = "error" | "warning" | "suggestion" | "info";
export type DiagnosticKind = "node" | "edge" | "zone" | "boundary" | "identity" | "permission" | "data" | "view";

export interface DiagnosticTarget {
  type: DiagnosticKind;
  id: string;
}

export interface LegacyDiagnosticRef {
  kind: Exclude<DiagnosticKind, "view">;
  id: string;
}

/** A validation / inference message attached to the model. */
export interface Diagnostic {
  /** Spec v0.1 diagnostic level. During Stage 3, `severity` remains for compatibility. */
  level?: DiagnosticLevel;
  severity: DiagnosticSeverity;
  /** Stable machine-readable code, e.g. "duplicate_node", "unknown_kind". */
  code: string;
  message: string;
  /** Optional pointer to the offending element. */
  ref?: LegacyDiagnosticRef;
  target?: DiagnosticTarget;
}

export interface AuthMeta {
  method?: string;
  token?: string;
  issuer?: string;
  audience?: string;
  validatedBy?: string;
  recipient?: string;
  scopes?: string[];
  claims?: unknown;
  /** Fields populated by label inference rather than explicit metadata (§22). */
  inferred?: string[];
}

export interface ArchNode {
  id: string;
  label: string;
  shape: NodeShape;
  zone?: string;
  resolvedZone?: string;
  layer?: string;
  kind?: string;
  provider?: string;
  principal?: string;
  placement?: Record<string, string>;
  contains?: string[];
  tags?: string[];
  description?: string;
  /** Extension metadata for platform-stack diagrams such as Android. */
  androidComponent?: string;
  androidLayer?: string;
  /** Fields populated by inference rather than explicit metadata. */
  inferred?: string[];
}

export interface BoundaryCrossing {
  crosses: string[];
  reviewed: boolean;
  assertedFalse?: boolean;
}

export interface ArchEdge {
  id: string;
  from: string;
  to: string;
  /** "from->to" selector key (spec 02 §6.2). */
  pairKey?: string;
  /** Where this edge came from (spec 02 §6). */
  source?: "graph" | "metadata" | "graph+metadata";
  label?: string;
  /** Graph-section label, preserved when metadata overrides `label` (02 §6.3). */
  graphLabel?: string;
  flow?: string;
  protocol?: string;
  auth?: AuthMeta;
  principal?: string;
  dataIds?: string[];
  /** Raw authoring value retained for backwards compatibility during Stage 2. */
  data?: unknown;
  networkPath?: string[];
  boundaryCrossing?: BoundaryCrossing;
  direction?: "one_way" | "two_way" | "request_response";
  tags?: string[];
  description?: string;
  /** Fields populated by label inference rather than explicit metadata (§22). */
  inferred?: string[];
}

export interface Zone {
  id: string;
  label?: string;
  kind?: string;
  provider?: string;
  parent?: string;
  contains?: string[];
  resolvedContains?: Array<{ type: "node" | "zone"; id: string }>;
  trustLevel?: string;
  owner?: string;
  description?: string;
}

export interface Boundary {
  id: string;
  label?: string;
  kind?: string;
  contains?: string[];
  resolvedContains?: Array<{ type: "node" | "zone" | "boundary"; id: string }>;
  zone?: string;
  description?: string;
}

export interface Identity {
  id: string;
  kind?: string;
  provider?: string;
  attachedTo?: string | string[];
  description?: string;
}

export interface Permission {
  id: string;
  principal: string;
  action: string;
  resource: string | { type: string; id: string };
  effect?: string;
  role?: string;
  condition?: unknown;
  description?: string;
}

export interface DataObject {
  id: string;
  label?: string;
  classification?: string;
  storedIn?: string[];
  processedBy?: string[];
  flows?: string[];
  storage?: string;
  retention?: string;
  description?: string;
}

export interface Layout {
  mode?: "auto" | "manual" | "mixed";
  direction?: Direction;
  nodes?: Record<string, { x: number; y: number }>;
  zones?: Record<string, { x: number; y: number }>;
  boundaries?: Record<string, { x: number; y: number }>;
}

export interface ViewConfig {
  default?: string | {
    base?: "overview" | "zone" | "3d" | string;
    overlays?: string[];
  };
  enabled?: string[];
  filters?: {
    zones?: string[];
    layers?: string[];
  };
}

export interface GraphSubgraph {
  id: string;
  label?: string;
  members: string[];
}

export interface ArchMapModel {
  version: string;
  direction: Direction;
  title?: string;
  description?: string;
  source?: {
    graph: string;
    metadata?: string;
  };
  graph: {
    direction: Direction;
    subgraphs: Record<string, GraphSubgraph>;
  };
  nodes: ArchNode[];
  edges: ArchEdge[];
  zones: Zone[];
  boundaries: Boundary[];
  identities: Identity[];
  permissions: Permission[];
  data: DataObject[];
  layout?: Layout;
  view?: ViewConfig;
  diagnostics: Diagnostic[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
  suggestions: Diagnostic[];
  infos: Diagnostic[];
}

export interface CanonicalArchMapModel {
  version: string;
  title?: string;
  description?: string;
  source?: {
    graph: string;
    metadata?: string;
  };
  graph: {
    direction: Direction;
    subgraphs: Record<string, GraphSubgraph>;
  };
  nodes: Record<string, ArchNode>;
  edges: Record<string, ArchEdge>;
  zones: Record<string, Zone>;
  boundaries: Record<string, Boundary>;
  identities: Record<string, Identity>;
  permissions: Record<string, Permission>;
  data: Record<string, DataObject>;
  layout?: Layout;
  view?: ViewConfig;
  diagnostics: Diagnostic[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
  suggestions: Diagnostic[];
  infos: Diagnostic[];
}

// --- Standard vocabulary (used for validation warnings, §23.2) -------------

/** §9 standard node kinds. */
export const STANDARD_KINDS: ReadonlySet<string> = new Set([
  // actor / client
  "user", "external_user", "client_app", "web_app", "mobile_app",
  "android_app", "ios_app", "desktop_app", "admin_console", "external_partner",
  // edge / gateway
  "cdn", "waf", "load_balancer", "api_gateway", "ingress", "reverse_proxy", "firewall",
  // runtime
  "runtime_service", "serverless_service", "container_service", "function",
  "kubernetes_service", "kubernetes_cluster", "pod", "vm", "batch_job", "workflow", "legacy_api",
  // data / messaging
  "database", "relational_database", "nosql_database", "object_storage",
  "file_storage", "queue", "topic", "event_bus", "cache", "data_warehouse", "legacy_database",
  // identity / security
  "identity_provider", "oauth_provider", "auth_service", "service_account",
  "iam_role", "iam_policy", "rbac_role", "secret", "certificate", "token",
  // network
  "vpc", "subnet", "nat", "vpn", "interconnect", "direct_connect",
  "private_link", "vpc_peering", "dns", "router", "network_boundary",
  // operations
  "logging", "monitoring", "alerting", "tracing", "ci_cd", "repository", "artifact_registry",
]);

/** §10 standard layers. */
export const STANDARD_LAYERS: ReadonlySet<string> = new Set([
  "client", "edge", "runtime", "data", "messaging",
  "identity", "network", "operations", "external",
]);

/** §13 standard flow types. */
export const STANDARD_FLOWS: ReadonlySet<string> = new Set([
  "request", "response", "request_response", "data_access", "data_write",
  "data_read", "replication", "sync", "batch", "event_publish", "event_subscribe",
  "message_send", "message_receive", "auth", "token_issue", "token_validate",
  "permission_grant", "admin_operation", "deployment", "monitoring",
  "logging", "telemetry_export", "metrics_export", "log_export", "trace_export",
  "security_scan", "compliance_scan", "network_route",
]);

export const STANDARD_BOUNDARY_KINDS: ReadonlySet<string> = new Set([
  "trust_boundary", "network_boundary", "cloud_boundary", "region_boundary",
  "subnet_boundary", "org_boundary", "policy_boundary",
]);

export const STANDARD_ZONE_KINDS: ReadonlySet<string> = new Set([
  "provider", "cloud", "folder", "project", "region", "zone", "network",
  "subnet", "cluster", "namespace", "client", "internet", "saas", "onprem",
  "partner", "operations", "identity",
]);

export const STANDARD_IDENTITY_KINDS: ReadonlySet<string> = new Set([
  "user", "external_user",
  "identity_provider", "oauth_provider", "auth_service", "service_account",
  "iam_role", "iam_policy", "rbac_role", "secret", "certificate", "token",
]);

export const STANDARD_DATA_CLASSIFICATIONS: ReadonlySet<string> = new Set([
  "public", "internal", "confidential", "personal", "secret", "restricted", "regulated",
]);
