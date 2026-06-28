# ArchMap Model and Validation Specification

Status: Draft v0.1  
Scope: Canonical model, normalization, reference resolution, diagnostics, validation rules

This document is the single source of truth for the normalized ArchMap model and validation diagnostics.

The syntax specification defines how authors write ArchMap. This specification defines what the parser produces.

---

## 1. Purpose

ArchMap validation exists to make architecture diagrams reviewable and trustworthy.

Validation should detect:

- syntax errors
- invalid references
- ambiguous references
- incomplete semantic metadata
- missing auth information
- missing dataflow information
- missing boundary information
- permission inconsistencies
- unsupported or unknown vocabulary
- rendering capability problems

Validation should not prevent useful rendering unless the model cannot be parsed or the semantic model would be unsafe or misleading to render.

---

## 2. Normalization pipeline

Parsing produces a normalized ArchMap model.

The normalization pipeline is:

```text
read source
  ↓
split graph and metadata
  ↓
parse graph nodes, edges, labels, subgraphs
  ↓
parse YAML metadata
  ↓
merge graph and metadata nodes
  ↓
resolve edge metadata
  ↓
normalize data relationships
  ↓
infer fields from labels and subgraphs
  ↓
resolve references
  ↓
validate semantics
  ↓
attach diagnostics
  ↓
return canonical model
```

Each step may emit diagnostics.

A renderer should consume the canonical model, not raw syntax.

---

## 3. Entity namespaces

IDs are unique within their own namespace.

Namespaces:

```text
node
edge
zone
boundary
data
identity
permission
```

Cross-namespace duplicate IDs are allowed but discouraged.

If a field accepts multiple reference types and a value matches more than one namespace, the parser must emit `ambiguous_reference` unless the field defines a deterministic resolution order.

### 3.1 Typed references

Fields that accept multiple reference types may support typed references.

```yaml
contains:
  - node:APIGW
  - zone:gcp
  - boundary:public_edge
```

String shorthand remains allowed:

```yaml
contains: [APIGW, gcp, public_edge]
```

String shorthand is resolved using the field-specific rules in this document.

---

## 4. Canonical model shape

The parser should return a canonical model with diagnostics attached.

```ts
type ArchMapModel = {
  version: string;
  title?: string;
  description?: string;

  source?: {
    graph: string;
    metadata?: string;
  };

  graph: {
    direction: "LR" | "TD";
    subgraphs: Record<string, GraphSubgraph>;
  };

  nodes: Record<string, Node>;
  edges: Record<string, Edge>;
  zones: Record<string, Zone>;
  boundaries: Record<string, Boundary>;
  permissions: Record<string, Permission>;
  data: Record<string, DataObject>;
  identities: Record<string, Identity>;

  view?: ViewHint;
  layout?: LayoutHint;

  diagnostics: Diagnostic[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
  suggestions: Diagnostic[];
  infos: Diagnostic[];
};
```

`diagnostics` is the combined list. The level-specific arrays are derived views of the same diagnostics.

---

## 5. Node model

```ts
type Node = {
  id: string;
  label: string;
  shape?: "rectangle" | "database" | "circle" | "diamond" | "unknown";
  zone?: string;
  resolvedZone?: string;
  layer?: string;
  kind?: string;
  provider?: string;
  principal?: string;
  placement?: Record<string, string>;
  tags?: string[];
  description?: string;
  inferred?: string[];
  diagnostics?: Diagnostic[];
};
```

Rules:

- Graph labels create initial labels.
- Metadata `nodes.*.label` overrides graph labels.
- Bare graph references may create placeholder nodes only when necessary for edge parsing; unresolved labels may default to the ID.
- Repeated shaped definitions emit `duplicate_node`.

---

## 6. Edge model

```ts
type Edge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  graphLabel?: string;
  flow?: string;
  protocol?: string;
  auth?: AuthMetadata;
  principal?: string;
  dataIds?: string[];
  networkPath?: string[];
  boundaryCrossing?: BoundaryCrossing;
  direction?: "one_way" | "two_way" | "request_response";
  source?: "graph" | "metadata" | "graph+metadata";
  pairKey: string;
  inferred?: string[];
  diagnostics?: Diagnostic[];
};
```

### 6.1 Canonical edge identity

ArchMap supports graph-derived edges and metadata-defined edges.

Rules:

1. Explicit metadata IDs are stable edge IDs.
2. Pair-key form is a selector, not a stable ID.
3. Graph-only edges receive generated IDs using this pattern:

```text
${from}__${to}__${index}
```

4. If exactly one graph edge matches a pair key, pair-key metadata is attached to that edge.
5. If multiple graph edges match a pair key, emit `edge_pair_ambiguous`.
6. Explicit-id metadata may define a semantic edge even when no matching graph edge exists.
7. Metadata-only semantic edges are included in the model with `source: "metadata"`.
8. Renderers may decide whether metadata-only edges are visible in the base view, but overlays may use them.

### 6.2 Pair key

A pair key has this syntax:

```text
Source->Target
```

The pair key refers to an edge from `Source` to `Target`.

Pair keys are convenient for simple diagrams but should not be used as stable references in complex diagrams.

### 6.3 Label precedence

When graph label and metadata `label` both exist:

1. `edge.label` uses metadata `label`.
2. `edge.graphLabel` preserves the graph label.
3. Renderers may show either or both, but metadata label is the semantic override.

### 6.4 Edge references

Fields that reference edges may accept:

- explicit edge ID
- pair key

Resolution order:

1. explicit edge ID
2. pair key if exactly one matching edge exists

If a pair key matches multiple edges, emit `edge_pair_ambiguous` or a field-specific ambiguity diagnostic such as `data_flow_ambiguous`.

---

## 7. Auth model

```ts
type AuthMetadata = {
  token?: string;
  issuer?: string;
  validatedBy?: string;
  method?: string;
  audience?: string;
  scopes?: string[];
  claims?: Record<string, unknown>;
  recipient?: string;
};
```

Auth references:

- `issuer` references a node ID
- `validatedBy` references a node ID
- `recipient` references a node ID

Unknown references emit:

```text
auth_unknown_issuer
auth_unknown_validator
auth_unknown_recipient
```

---

## 8. Data model

```ts
type DataObject = {
  id: string;
  label?: string;
  classification?: string;
  storedIn?: string[];
  processedBy?: string[];
  flows?: string[];
  storage?: "persistent" | "transient" | string;
  retention?: string;
  description?: string;
  diagnostics?: Diagnostic[];
};
```

### 8.1 Data relation normalization

`edges.*.data` and `data.*.flows` are two ways to declare the same relationship.

The parser normalizes them into:

- `edge.dataIds`
- `data.flows`

Rules:

1. If an edge declares `data`, the corresponding data object receives that edge in `flows`.
2. If a data object declares `flows`, the corresponding edge receives that data ID in `dataIds`.
3. If both sides are present and consistent, no diagnostic is emitted.
4. If both sides are present but conflict, emit `data_flow_mismatch`.
5. Unknown data IDs on edges emit `edge_unknown_data`.
6. Unknown edge references in `data.flows` emit `data_unknown_flow`.
7. Ambiguous pair-key flows emit `data_flow_ambiguous`.

### 8.2 Transient data

If a data object has flows but no `storedIn`, emit `dataflow_missing_storage` unless:

- `storage: transient`
- `storedIn: []` with an explicit transient-like note

---

## 9. Zone model

```ts
type Zone = {
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
  inferred?: string[];
  diagnostics?: Diagnostic[];
};
```

### 9.1 Zone containment resolution

Zone `contains` accepts node IDs and zone IDs.

String shorthand resolution order:

1. zone ID
2. node ID

If a string matches both a zone and a node, emit `ambiguous_reference` and prefer explicit typed reference syntax.

### 9.2 Primary zone resolution

A node's primary zone is resolved using this order:

1. `nodes.<id>.zone`
2. `zones.*.contains`
3. subgraph inference
4. placement-derived inference, if configured
5. `unknown`

Explicit `nodes.<id>.zone` takes precedence.

Conflicts emit:

```text
node_zone_conflict
node_in_multiple_zones
zone_parent_conflict
```

### 9.3 Zone nesting rules

- Zone cycles are errors.
- Unknown parent references are warnings.
- Parent/contains contradictions are errors.
- A zone may contain child zones and nodes.

---

## 10. Boundary model

```ts
type Boundary = {
  id: string;
  label?: string;
  kind?: string;
  contains?: string[];
  resolvedContains?: Array<{ type: "node" | "zone" | "boundary"; id: string }>;
  zone?: string;
  description?: string;
  diagnostics?: Diagnostic[];
};
```

### 10.1 Boundary containment resolution

Boundary `contains` accepts node IDs, zone IDs, and boundary IDs.

String shorthand resolution order:

1. boundary ID
2. zone ID
3. node ID

If a string matches more than one namespace, emit `ambiguous_reference` and prefer typed references.

### 10.2 Boundary crossing model

```ts
type BoundaryCrossing = {
  crosses: string[];
  reviewed: boolean;
  assertedFalse?: boolean;
};
```

Authoring forms normalize as follows:

```yaml
boundaryCrossing: true
```

normalizes to:

```json
{ "crosses": [], "reviewed": true }
```

```yaml
boundaryCrossing: false
```

normalizes to:

```json
{ "crosses": [], "reviewed": true, "assertedFalse": true }
```

```yaml
boundaryCrossing: [public_edge, gcp_private]
```

normalizes to:

```json
{ "crosses": ["public_edge", "gcp_private"], "reviewed": true }
```

If `boundaryCrossing: false` is declared but the edge crosses primary zones, emit `zone_crossing_marked_false`.

---

## 11. Permission model

```ts
type Permission = {
  id: string;
  principal?: string;
  action?: string;
  resource?: ResourceRef;
  effect?: "allow" | "deny" | string;
  role?: string;
  condition?: string | Record<string, unknown>;
  description?: string;
  diagnostics?: Diagnostic[];
};

type ResourceRef =
  | string
  | { type: "node" | "zone" | "boundary" | "data" | string; id: string };
```

### 11.1 Principal resolution

A principal is known if it appears in:

- `identities`
- `nodes.*.principal`

If a permission principal is not a graph node:

- if it exists in `identities`, renderers may show it as an identity badge or virtual identity node
- if it appears as `nodes.*.principal`, renderers may attach it to that node
- if it is unknown, emit `permission_unknown_principal`

### 11.2 Resource resolution

Resource short form assumes a node ID:

```yaml
resource: CloudSQL
```

Advanced resource form may target other namespaces:

```yaml
resource:
  type: zone
  id: project-a
```

Unknown resources emit `permission_unknown_resource`.

---

## 12. Identity model

```ts
type Identity = {
  id: string;
  kind?: string;
  provider?: string;
  attachedTo?: string | string[];
  description?: string;
};
```

`attachedTo` references node IDs.

---

## 13. View and layout hints

```ts
type ViewHint = {
  default?: {
    base?: "overview" | "zone" | "3d";
    overlays?: string[];
  } | string;
};

type LayoutHint = {
  mode?: "auto" | "manual" | "mixed" | string;
  direction?: "LR" | "TD";
  nodes?: Record<string, { x?: number; y?: number; z?: number }>;
};
```

View and layout hints are renderer inputs, not core semantic architecture facts.

Manual coordinates are never required.

---

## 14. Diagnostic levels

ArchMap diagnostics use four levels.

```text
error
warning
suggestion
info
```

### 14.1 Error

Errors indicate that the model is invalid or unsafe to render fully.

Examples:

- invalid YAML
- duplicate node ID
- edge references unknown node
- zone cycle

### 14.2 Warning

Warnings indicate that the model can render but important semantic information is missing, suspicious, or inconsistent.

Examples:

- JWT edge without issuer
- data access edge without principal
- cross-zone edge without boundary review

### 14.3 Suggestion

Suggestions indicate improvement opportunities.

Examples:

- node has no metadata
- edge has protocol but no flow
- data object has no classification

### 14.4 Info

Info diagnostics are informational.

Examples:

- field inferred from label
- default direction applied

---

## 15. Diagnostic shape

```ts
type Diagnostic = {
  level: "error" | "warning" | "suggestion" | "info";
  code: string;
  message: string;
  ref?: string;
  target?: {
    type: "node" | "edge" | "zone" | "boundary" | "permission" | "data" | "identity" | "view";
    id: string;
  };
};
```

Example:

```json
{
  "level": "warning",
  "code": "auth_token_without_issuer",
  "message": "Edge \"Web_API\" carries a token but declares no issuer.",
  "ref": "Web_API",
  "target": { "type": "edge", "id": "Web_API" }
}
```

---

## 16. Diagnostic output

Diagnostics must be available in:

```text
model.diagnostics
model.errors
model.warnings
model.suggestions
model.infos
```

`model.diagnostics` is the combined list.

The level-specific arrays are filtered views of `model.diagnostics`.

---

## 17. Diagnostic code registry

This registry is the single source of truth for diagnostic codes.

### 17.1 Parser diagnostics

| Code | Level | Meaning |
| --- | --- | --- |
| `invalid_node_id` | error | Node ID violates ID rules. |
| `duplicate_node` | error | A shaped node definition appears more than once. |
| `invalid_yaml` | error | Metadata YAML cannot be parsed. |
| `metadata_not_object` | error | Metadata root is not a mapping/object. |
| `edge_missing_endpoint` | error | Explicit-id edge lacks `from` or `to`. |
| `edge_unknown_source` | error | Edge source node does not exist. |
| `edge_unknown_target` | error | Edge target node does not exist. |
| `unparsed_line` | warning | A graph line could not be parsed. |
| `missing_direction` | info | Graph direction was omitted and defaulted to `LR`. |

### 17.2 Graph / metadata diagnostics

| Code | Level | Meaning |
| --- | --- | --- |
| `metadata_node_not_in_graph` | warning | Metadata declares a node not present in graph. |
| `node_without_metadata` | suggestion | Graph node has no metadata. |
| `ambiguous_reference` | warning | A reference matches multiple namespaces. |

### 17.3 Vocabulary diagnostics

| Code | Level | Meaning |
| --- | --- | --- |
| `unknown_node_kind` | warning | Unknown node kind. |
| `unknown_zone_kind` | warning | Unknown zone kind. |
| `unknown_boundary_kind` | warning | Unknown boundary kind. |
| `unknown_identity_kind` | warning | Unknown identity kind. |
| `unknown_layer` | warning | Unknown layer. |
| `unknown_flow` | warning | Unknown flow. |
| `unknown_classification` | warning | Unknown data classification. |

### 17.4 Edge diagnostics

| Code | Level | Meaning |
| --- | --- | --- |
| `edge_pair_ambiguous` | warning | Pair-key metadata matches multiple graph edges. |
| `edge_unknown_data` | warning | Edge references an unknown data object. |
| `data_flow_mismatch` | warning | `edges.*.data` and `data.*.flows` disagree. |
| `data_flow_ambiguous` | warning | Data flow reference matches multiple edges. |

### 17.5 Auth diagnostics

| Code | Level | Meaning |
| --- | --- | --- |
| `auth_flow_without_token` | warning | Flow expects token metadata but no token is declared. |
| `auth_token_without_issuer` | warning | Token is declared but issuer is missing. |
| `auth_token_without_validator` | warning | Token-carrying request-like flow lacks validator. |
| `auth_token_without_recipient` | suggestion | Token issue flow lacks recipient. |
| `auth_unknown_issuer` | warning | Auth issuer references an unknown node. |
| `auth_unknown_validator` | warning | Auth validator references an unknown node. |
| `auth_unknown_recipient` | warning | Auth recipient references an unknown node. |

### 17.6 Zone diagnostics

| Code | Level | Meaning |
| --- | --- | --- |
| `zone_unknown_node` | warning | Zone contains an unknown node. |
| `zone_unknown_child_zone` | warning | Zone contains an unknown child zone. |
| `zone_parent_unknown` | warning | Zone declares an unknown parent. |
| `zone_parent_conflict` | error | `parent` and `contains` conflict. |
| `zone_cycle` | error | Zone nesting contains a cycle. |
| `node_zone_unknown` | suggestion | Node declares a zone that is not known and cannot be inferred. |
| `node_zone_conflict` | warning | Node zone metadata conflicts with inferred zone. |
| `node_in_multiple_zones` | warning | Node appears in multiple primary zones. |

### 17.7 Boundary diagnostics

| Code | Level | Meaning |
| --- | --- | --- |
| `boundary_unknown_node` | warning | Boundary contains an unknown node. |
| `boundary_unknown_zone` | warning | Boundary contains an unknown zone. |
| `boundary_unknown_boundary` | warning | Boundary contains an unknown boundary. |
| `boundary_unknown_related_zone` | warning | Boundary `zone` references an unknown zone. |
| `boundary_cycle` | error | Nested boundaries form a cycle. |
| `zone_crossing_without_boundary` | warning | Edge crosses primary zones but lacks boundary review. |
| `zone_crossing_marked_false` | warning | Edge crosses primary zones but declares `boundaryCrossing: false`. |

### 17.8 Data diagnostics

| Code | Level | Meaning |
| --- | --- | --- |
| `data_unknown_flow` | warning | Data object references an unknown edge or pair key. |
| `data_unknown_node` | warning | Data object references an unknown node in `storedIn` or `processedBy`. |
| `data_without_classification` | suggestion | Data object has no classification. |
| `dataflow_missing_storage` | suggestion | Data object has flows but no storage and is not transient. |
| `telemetry_without_data_classification` | suggestion | Telemetry-like flow lacks data classification context. |

### 17.9 Permission diagnostics

| Code | Level | Meaning |
| --- | --- | --- |
| `permission_incomplete` | warning | Permission lacks principal, action, or resource. |
| `permission_unknown_principal` | warning | Permission references an unknown principal. |
| `permission_unknown_resource` | warning | Permission references an unknown resource. |
| `data_access_without_principal` | warning | `data_access` flow lacks principal. |

### 17.10 Placement diagnostics

| Code | Level | Meaning |
| --- | --- | --- |
| `placement_ref_unknown` | suggestion | Placement value appears to reference an unknown modeled object. |

### 17.11 Inference diagnostics

| Code | Level | Meaning |
| --- | --- | --- |
| `inferred_protocol` | info | Protocol inferred from label. |
| `inferred_auth_token` | info | Auth token inferred from label. |
| `inferred_flow` | info | Flow inferred from label. |
| `inferred_zone` | info | Zone inferred from subgraph or placement. |

### 17.12 View and renderer diagnostics

| Code | Level | Meaning |
| --- | --- | --- |
| `unknown_base_view` | warning | Requested base view is not registered. |
| `unknown_overlay` | warning | Requested overlay is not registered. |
| `view_3d_unavailable` | warning | 3D renderer could not be loaded. |
| `src_fetch_failed` | error | External source failed to load. |

---

## 18. Flow-sensitive auth validation

Auth validation depends on edge `flow`.

| Flow | `auth.token` | `auth.issuer` | `auth.validatedBy` | `auth.recipient` |
| --- | --- | --- | --- | --- |
| `token_issue` | required | required | not required | suggested |
| `token_validate` | required | suggested | required | optional |
| `request` | optional | required if token | required if token | optional |
| `request_response` | optional | required if token | required if token | optional |
| `data_access` | optional | suggested if token | suggested if token | optional |
| `admin_operation` | optional | suggested if token | suggested if token | optional |
| `monitoring` | optional | optional | optional | optional |
| `logging` | optional | optional | optional | optional |
| `metrics_export` | optional | optional | optional | optional |
| `log_export` | optional | optional | optional | optional |
| `trace_export` | optional | optional | optional | optional |

Rules:

- `token_issue` without `auth.token` emits `auth_flow_without_token`.
- `token_issue` without `auth.issuer` emits `auth_token_without_issuer`.
- `token_issue` without `auth.recipient` emits `auth_token_without_recipient`.
- `token_validate` without `auth.token` emits `auth_flow_without_token`.
- `token_validate` without `auth.validatedBy` emits `auth_token_without_validator`.
- request-like flows with `auth.token` but no issuer emit `auth_token_without_issuer`.
- request-like flows with `auth.token` but no validator emit `auth_token_without_validator`.

---

## 19. Boundary validation

### 19.1 Cross-zone detection

If an edge source and target resolve to different primary zones and the edge lacks boundary review, emit:

```text
zone_crossing_without_boundary
```

Boundary review means `boundaryCrossing` is present as `true`, `false`, or a boundary list.

If the value is `false` but the edge crosses primary zones, emit:

```text
zone_crossing_marked_false
```

### 19.2 Boundary reference validation

Boundary `contains` references are resolved as boundary, zone, then node.

Unknown references emit specific diagnostics:

```text
boundary_unknown_boundary
boundary_unknown_zone
boundary_unknown_node
```

---

## 20. Dataflow validation

Rules:

- `data.flows` references must resolve to an edge.
- `data.storedIn` references must resolve to nodes.
- `data.processedBy` references must resolve to nodes.
- `edges.*.data` references must resolve to data objects.
- Data objects should declare `classification`.
- Data objects with flows should declare storage unless marked transient.
- Telemetry, logging, metrics, traces, monitoring, and SaaS export flows should declare data objects and classifications when possible.

---

## 21. Permission validation

Rules:

- `principal`, `action`, and `resource` are required for a permission.
- Unknown principals emit `permission_unknown_principal`.
- Unknown resources emit `permission_unknown_resource`.
- `data_access` flows should declare `principal`.

---

## 22. Vocabulary validation

Known vocabulary fields:

- node `kind`
- zone `kind`
- boundary `kind`
- identity `kind`
- node `layer`
- edge `flow`
- data `classification`

Unknown values are allowed but should emit warnings. This keeps ArchMap extensible while making unexpected vocabulary visible.

---

## 23. Console reporting

By default, engines should log warnings and errors to the browser console.

Recommended format:

```text
[ArchMap warning] auth_token_without_issuer: Edge "Web_API" carries a token but declares no issuer.
```

Console reporting must be configurable.

---

## 24. Diagnostic UI requirements

Diagnostic UI should show:

- count by level
- diagnostic code
- message
- target reference
- click-to-highlight behavior

Example:

```text
Errors 0 / Warnings 3 / Suggestions 5 / Info 2
▲ auth_token_without_issuer Edge "Web_API"
```

---

## 25. Validation acceptance criteria

Validation is acceptable when:

1. Parser errors are reported with stable codes.
2. All diagnostics use the four-level model.
3. `model.diagnostics` and level-specific arrays are consistent.
4. Semantic warnings do not prevent rendering.
5. Suggestions do not feel like failures.
6. Auth validation changes behavior based on flow type.
7. Boundary validation detects cross-zone edges.
8. Dataflow validation detects missing flows, unknown nodes, and inconsistent two-way declarations.
9. Permission validation checks principal, action, and resource.
10. Zone nesting validation detects unknown zones, conflicts, and cycles.
11. Reference ambiguity is reported instead of guessed silently.
12. Diagnostics can be displayed in the validation overlay, console, and diagnostic panel.
