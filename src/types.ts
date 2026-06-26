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

/** A validation / inference message attached to the model. */
export interface Diagnostic {
  severity: DiagnosticSeverity;
  /** Stable machine-readable code, e.g. "duplicate_node", "unknown_kind". */
  code: string;
  message: string;
  /** Optional pointer to the offending element. */
  ref?: { kind: "node" | "edge" | "zone" | "boundary" | "identity" | "permission" | "data"; id: string };
}

export interface AuthMeta {
  method?: string;
  token?: string;
  issuer?: string;
  audience?: string;
  validatedBy?: string;
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
  layer?: string;
  kind?: string;
  provider?: string;
  principal?: string;
  contains?: string[];
  tags?: string[];
  description?: string;
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
  data?: unknown;
  networkPath?: string[];
  boundaryCrossing?: boolean | string[];
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
  contains?: string[];
  trustLevel?: string;
  description?: string;
}

export interface Boundary {
  id: string;
  label?: string;
  kind?: string;
  contains?: string[];
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
  resource: string;
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
  default?: string;
  enabled?: string[];
  filters?: {
    zones?: string[];
    layers?: string[];
  };
}

export interface ArchMapModel {
  version: string;
  direction: Direction;
  title?: string;
  description?: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  zones: Zone[];
  boundaries: Boundary[];
  identities: Identity[];
  permissions: Permission[];
  data: DataObject[];
  layout?: Layout;
  view?: ViewConfig;
  warnings: Diagnostic[];
  errors: Diagnostic[];
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
  "kubernetes_service", "pod", "vm", "batch_job", "workflow", "legacy_api",
  // data / messaging
  "database", "relational_database", "nosql_database", "object_storage",
  "file_storage", "queue", "topic", "event_bus", "cache", "data_warehouse", "legacy_database",
  // identity / security
  "identity_provider", "oauth_provider", "auth_service", "service_account",
  "iam_role", "iam_policy", "rbac_role", "secret", "certificate", "token",
  // network
  "vpc", "subnet", "nat", "vpn", "interconnect", "direct_connect",
  "private_link", "dns", "router", "network_boundary",
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
  "logging", "network_route",
]);
