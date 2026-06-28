# ArchMap DSL Syntax Specification

Status: Draft v0.1  
Scope: Authoring syntax, graph section, metadata section, recommended fields

This document defines the ArchMap authoring language. It does not define the canonical normalized model or diagnostic registry. Those are defined in `02-model-validation.md`.

---

## 1. Language overview

An ArchMap document is a Mermaid-like graph plus optional YAML metadata.

```text
graph section
---
YAML metadata section
```

The graph section provides the visible structure.  
The metadata section adds semantic architecture information.

ArchMap intentionally follows Mermaid-like graph notation so users can start from familiar syntax, then adds metadata for layers, zones, boundaries, authentication, permissions, and dataflow.

---

## 2. Authoring tiers

ArchMap syntax is divided into three authoring tiers.

### 2.1 Core

Core syntax is the recommended normal authoring surface.

Core includes:

- graph nodes
- graph edges
- edge labels
- subgraphs
- `nodes`
- `edges`
- `zones`
- `boundaries`
- `permissions`
- `data`
- `view`

### 2.2 Optional / advanced

Optional syntax may be parsed and used, but should not be required for ordinary diagrams.

Optional includes:

- `identities`
- `layout`
- detailed `placement`
- advanced auth fields such as `audience`, `claims`, `scopes`
- advanced permission fields such as `condition`

### 2.3 Backlog

Backlog syntax should not be presented as normal authoring syntax in v0.1.

Backlog includes:

- manually authored full node coordinates
- node nesting through `nodes.*.contains`
- full GUI round-trip editing
- full provider import syntax
- full OAuth/OIDC protocol modeling
- timeline or 4D modeling

---

## 3. Document format

A document may contain only a graph section or a graph section followed by metadata.

````markdown
```archmap
graph LR
  Web[Web App] -->|HTTPS + JWT| API[API Gateway]
  API --> DB[(Cloud SQL)]
---
nodes:
  Web: { zone: client, layer: client, kind: web_app }
  API: { zone: gcp, layer: edge, kind: api_gateway, provider: gcp }
  DB:  { zone: gcp, layer: data, kind: relational_database, provider: gcp }

edges:
  Web->API:
    flow: request
    protocol: HTTPS
    auth: { token: JWT, issuer: FirebaseAuth, validatedBy: API }
    boundaryCrossing: true
```
````

The separator must be a line containing only:

```text
---
```

If the separator is omitted, the whole document is treated as the graph section.

---

## 4. Graph section

The graph section uses a Mermaid-like subset.

### 4.1 Direction

Supported direction declarations:

```text
graph LR
graph TD
flowchart LR
flowchart TD
flowchart TB
```

`TB` is normalized to `TD`.

If direction is missing, it defaults to `LR` and emits `missing_direction` as an informational diagnostic.

### 4.2 Node forms

| Form | Example | Meaning |
| --- | --- | --- |
| Rectangle | `A[Label]` | Generic component |
| Database | `A[(Label)]` | Database or storage |
| Circle | `A((Label))` | User, actor, external participant |
| Diamond | `A{Label}` | Decision, policy, or control point |
| Bare reference | `A` | Reuses a node defined elsewhere |

A node is defined when it appears with a shape. A bare reference does not redefine a node.

### 4.3 Node IDs

Node IDs must:

- start with an ASCII letter
- contain only ASCII letters, digits, `_`, or `-` after the first character
- be unique within the node namespace

Examples:

```text
App
Web_App
api-gateway
Service1
```

Invalid examples:

```text
1App
api.gateway
api/gateway
```

### 4.4 Edge forms

Supported edge forms:

```text
A --> B
A -->|Label| B
A[App] --> B[DB]
A -->|HTTPS + JWT| B
```

Only one arrow is allowed per graph line in v0.1.

Additional Mermaid edge styles may be accepted in future versions, but v0.1 renderers should not depend on them.

### 4.5 Comments

Graph comments start with `%%` and are stripped.

```text
%% this is a comment
```

### 4.6 Subgraphs

Subgraphs provide convenient grouping.

```text
subgraph GCP
  API[API Gateway]
  App[Cloud Run]
end
```

A subgraph is authoring-only grouping. It is preserved in the model so tooling can understand source hierarchy, but it does not create rendered geometry by itself.

Use explicit `zones`, `boundaries`, or `nodes.*.layer` metadata when a group should affect rendering.

---

## 5. Metadata section

The metadata section is YAML and must parse to a mapping/object.

### 5.1 Recommended top-level keys

```yaml
title:
description:
nodes:
edges:
zones:
boundaries:
permissions:
data:
view:
```

### 5.2 Optional / advanced top-level keys

```yaml
identities:
layout:
```

Unknown top-level keys are allowed for extensibility. Renderers may ignore unknown keys.

---

## 6. Nodes

Nodes are declared under `nodes`.

```yaml
nodes:
  App:
    label: Cloud Run
    zone: gcp
    layer: runtime
    kind: serverless_service
    provider: gcp
    principal: app-sa
    placement:
      project: project-a
      region: asia-northeast1
      network: shared-vpc
    tags: [public, prod]
    description: Main application runtime.
```

### 6.1 Node fields

| Field | Status | Description |
| --- | --- | --- |
| `label` | core | Display label. Overrides graph label. |
| `zone` | core | Primary zone used by zone and 3D views. |
| `layer` | core | Architecture layer used by 3D height or stacking. |
| `kind` | core | Standard component kind. |
| `provider` | core | Cloud/platform/vendor such as `gcp`, `aws`, `firebase`, `datadog`. |
| `principal` | core | Runtime identity such as a service account or role. |
| `placement` | core for advanced infra | Additional placement dimensions. |
| `tags` | optional | Free-form tags. |
| `description` | optional | Human-readable note. |
| `contains` | backlog | Avoid in v0.1 normal authoring. Prefer `zones` and `boundaries`. |

### 6.2 Placement

Use `zone` for the primary display grouping. Use `placement` when a node belongs to multiple infrastructure dimensions.

```yaml
nodes:
  ServiceA:
    zone: project-a
    layer: runtime
    kind: kubernetes_service
    provider: gcp
    principal: svc-a-sa
    placement:
      provider: gcp
      project: project-a
      region: asia-northeast1
      cluster: gke-a-jp
      fleet: fleet-prod
      network: shared-vpc
      subnet: subnet-jp
      environment: prod
```

Placement is important for Shared VPC, GKE Fleet, multi-region, hybrid network, and account/project-separated architectures.

---

## 7. Edges

Edges may be declared in pair-key form or explicit-id form.

### 7.1 Pair-key form

Pair-key form is recommended for simple diagrams.

```yaml
edges:
  Web->API:
    flow: request
    protocol: HTTPS
    auth:
      token: JWT
      issuer: FirebaseAuth
      validatedBy: API
    boundaryCrossing: true
```

The key `Web->API` selects the graph edge from `Web` to `API`.

If more than one graph edge shares the same source and target, pair-key form becomes ambiguous and explicit-id form should be used.

### 7.2 Explicit-id form

Explicit-id form is recommended when stable edge IDs are needed.

```yaml
edges:
  web_api_request:
    from: Web
    to: API
    label: HTTPS + JWT
    flow: request
    protocol: HTTPS
    auth:
      token: JWT
      issuer: FirebaseAuth
      validatedBy: API
    boundaryCrossing: true

  web_api_admin:
    from: Web
    to: API
    label: Admin Operation
    flow: admin_operation
    protocol: HTTPS
    boundaryCrossing: true
```

Use explicit IDs when:

- the same node pair has multiple semantic edges
- `data.flows` needs stable references
- graph labels are not enough to distinguish relationships
- an overlay needs to select a precise relationship

### 7.3 Edge fields

| Field | Status | Description |
| --- | --- | --- |
| `from` | required for explicit-id | Source node ID. |
| `to` | required for explicit-id | Target node ID. |
| `label` | optional | Display label or graph label override. |
| `flow` | core | Semantic flow type. |
| `protocol` | core | Protocol or protocol family. |
| `auth` | core | Authentication/token metadata. |
| `principal` | core | Principal used for access or operation. |
| `data` | core | Data object IDs carried by this edge. Scalar, list, or object forms may be accepted. |
| `networkPath` | core | Network path such as `[Shared VPC, VPN, Firewall]`. |
| `boundaryCrossing` | core | `true`, `false`, or a list of boundary IDs. |
| `direction` | optional | `one_way`, `two_way`, or `request_response`. |
| `tags` | optional | Free-form tags. |
| `description` | optional | Human-readable note. |

Edge identity, pair-key matching, and data relation normalization are defined in `02-model-validation.md`.

---

## 8. Auth metadata

Auth metadata is primarily used by the `auth` overlay.

```yaml
edges:
  Web->API:
    flow: request
    auth:
      token: JWT
      issuer: FirebaseAuth
      validatedBy: API
```

### 8.1 Auth fields

| Field | Status | Description |
| --- | --- | --- |
| `token` | core | Token type such as `JWT`, `access_token`, `id_token`, `session_cookie`. |
| `issuer` | core | Node ID that issues the token. |
| `validatedBy` | core | Node ID that validates the token. |
| `method` | optional | `bearer`, `cookie`, `oauth`, `oidc`, `api_key`, `mTLS`, etc. |
| `audience` | optional | Token audience. |
| `scopes` | optional | OAuth/OIDC scopes. |
| `claims` | optional | Important token claims. |
| `recipient` | optional | Recipient for token issue flows. |

### 8.2 Auth flow example

```yaml
edges:
  FirebaseAuth->Web:
    flow: token_issue
    auth:
      token: JWT
      issuer: FirebaseAuth
      recipient: Web

  Web->API:
    flow: request
    auth:
      token: JWT
      issuer: FirebaseAuth
      validatedBy: API
```

Flow-sensitive auth validation is defined in `02-model-validation.md`.

---

## 9. Data

Data objects are declared under `data`.

```yaml
data:
  customer_profile:
    label: Customer Profile
    classification: personal
    storedIn: [CloudSQL, RDS]
    processedBy: [App]
    flows: [web_api, app_db, gcp_aws]
    retention: 365d
    description: Personal profile data.
```

### 9.1 Data fields

| Field | Status | Description |
| --- | --- | --- |
| `label` | core | Human-readable data name. |
| `classification` | core | `public`, `internal`, `confidential`, `personal`, `secret`, etc. |
| `storedIn` | core | Node IDs where the data is stored. |
| `flows` | core | Edge IDs or pair keys carrying the data. |
| `processedBy` | optional | Nodes that process the data. |
| `storage` | optional | `persistent`, `transient`, or implementation-specific. |
| `retention` | optional | Retention note. |
| `description` | optional | Human-readable note. |

`edges.*.data` and `data.*.flows` are two authoring forms for the same relationship. Their normalized meaning is defined in `02-model-validation.md`.

### 9.2 Transient data

Data that is carried but not stored may explicitly declare transient storage.

```yaml
data:
  access_token:
    classification: secret
    flows: [Web->API]
    storage: transient
```

This prevents transient-only data from being treated as missing persistent storage.

---

## 10. Zones

Zones are the main grouping mechanism for `zone` and `3d` base views.

A zone represents placement, ownership, environment, provider, network, account/project, or another stable grouping dimension.

```yaml
zones:
  gcp:
    label: GCP
    kind: provider
    provider: gcp
    contains: [project-a, project-b, shared-vpc-host]

  project-a:
    label: Project A
    kind: project
    parent: gcp
    contains: [GKEClusterA, ServiceA]
```

### 10.1 Zone fields

| Field | Status | Description |
| --- | --- | --- |
| `label` | core | Display label. |
| `kind` | core | Zone kind such as `provider`, `cloud`, `project`, `region`, `network`, `client`, `saas`, `onprem`. |
| `provider` | optional | `gcp`, `aws`, `azure`, `onprem`, etc. |
| `parent` | core for nesting | Parent zone ID. |
| `contains` | core | Node IDs and/or child zone IDs. |
| `trustLevel` | optional | `public`, `private`, `restricted`, `external`. |
| `owner` | optional | Team, organization, or responsibility owner. |
| `description` | optional | Human-readable note. |

### 10.2 Zone rules

- A zone may contain node IDs and zone IDs.
- A zone may declare `parent`.
- If both `parent` and `contains` are present, they must describe the same hierarchy.
- A zone may contain child zones.
- Cyclic zone nesting is an error.
- A node should have one primary `zone`.
- Additional infrastructure dimensions should use `placement`.

Reference resolution and conflict handling are defined in `02-model-validation.md`.

---

## 11. Boundaries

Boundaries represent trust, network, cloud, region, organization, or policy borders.

A boundary is not the same as a zone:

- a zone describes where something belongs
- a boundary describes a review or control surface

```yaml
boundaries:
  public_edge:
    label: Public→GCP Trust Boundary
    kind: trust_boundary
    contains: [APIGW]

  gcp_private:
    label: GCP Private Network
    kind: network_boundary
    contains: [GCPApp, CloudSQL]
    zone: gcp
```

### 11.1 Boundary fields

| Field | Status | Description |
| --- | --- | --- |
| `label` | core | Display label. |
| `kind` | core | Boundary kind such as `trust_boundary`, `network_boundary`, `cloud_boundary`, `org_boundary`. |
| `contains` | core | Node IDs, zone IDs, or boundary IDs. |
| `zone` | optional | Related zone. |
| `description` | optional | Human-readable note. |

### 11.2 Boundary crossing field

Edges may declare `boundaryCrossing`.

```yaml
edges:
  Web->API:
    boundaryCrossing: true

  GCPApp->AWSApp:
    boundaryCrossing: [gcp_private, aws_boundary]

  App->InternalDB:
    boundaryCrossing: false
```

Normalized boundary crossing semantics are defined in `02-model-validation.md`.

---

## 12. Permissions

Permissions are declared under `permissions`.

```yaml
permissions:
  cloudsql_access:
    principal: app-sa
    action: connect
    resource: CloudSQL
    effect: allow
    role: roles/cloudsql.client
```

### 12.1 Permission fields

| Field | Status | Description |
| --- | --- | --- |
| `principal` | core | Identity string or identity ID. |
| `action` | core | Action or operation. |
| `resource` | core | Target resource. Short form references a node ID. |
| `effect` | optional | `allow` or `deny`. |
| `role` | optional | IAM/RBAC role. |
| `condition` | optional | Conditional rule. |
| `description` | optional | Human-readable note. |

### 12.2 Resource short form

The short form assumes a node resource:

```yaml
resource: CloudSQL
```

Advanced resource form may be supported:

```yaml
resource:
  type: zone
  id: project-a
```

---

## 13. Identities

`identities` is optional. It is useful when a principal needs metadata beyond a string reference.

```yaml
identities:
  app-sa:
    kind: service_account
    provider: gcp
    attachedTo: App
```

`attachedTo` may be a string or a list.

Simple diagrams may use only `nodes.*.principal` and `permissions.*.principal`.

---

## 14. Layout

`layout` is optional.

Manual positions are not required for any base view, including `3d`.

```yaml
layout:
  mode: auto
  direction: LR
```

Manual positions are reserved for future GUI round-trip editing and may be ignored by renderers.

```yaml
layout:
  mode: mixed
  nodes:
    Web: { x: 120, y: 240 }
```

---

## 15. View metadata

`view` is an optional initial display hint. It is not part of the core semantic architecture model.

```yaml
view:
  default:
    base: overview
    overlays: [auth, dataflow]
```

A renderer may also accept the older compact form:

```yaml
view:
  default: overview
```

Runtime UI state should override the initial state.

---

## 16. Label inference

Inference fills fields only when they are not set explicitly. Inferred fields must not silently overwrite explicit metadata.

Each inferred field should be listed in the edge's `inferred[]`.

| Label matches | Inferred |
| --- | --- |
| `https` | `protocol: HTTPS` |
| `http` as a word | `protocol: HTTP` |
| `sql` as a word | `protocol: SQL` |
| `jwt` | `auth.token: JWT` |
| `oauth` | `auth.method: oauth` |
| `pub/sub` | `flow: event_publish` |
| `sqs` as a word | `flow: message_send` |
| `replication` | `flow: replication` |
| `sync` as a word | `flow: sync` |
| `metrics` | `flow: monitoring` |
| `logs` | `flow: logging` |
| `scan` / `scans` | `flow: security_scan` when supported |
| `vpn` | `networkPath` hint and/or `boundaryCrossing` suggestion |

Protocol precedence: HTTPS before HTTP.

---

## 17. Standard vocabularies

Unknown vocabulary values are allowed for extensibility but should produce diagnostics.

### 17.1 Standard layers

```yaml
client
edge
runtime
data
messaging
identity
network
operations
external
```

### 17.2 Standard zone kinds

```yaml
provider
cloud
folder
project
region
zone
network
subnet
cluster
namespace
client
internet
saas
onprem
partner
operations
identity
```

### 17.3 Standard boundary kinds

```yaml
trust_boundary
network_boundary
cloud_boundary
region_boundary
subnet_boundary
org_boundary
policy_boundary
```

### 17.4 Standard data classifications

```yaml
public
internal
confidential
personal
secret
restricted
regulated
```

### 17.5 Standard node kinds

```yaml
user
external_user
client_app
web_app
mobile_app
android_app
ios_app
desktop_app
admin_console
external_partner

cdn
waf
load_balancer
api_gateway
ingress
reverse_proxy
firewall

runtime_service
serverless_service
container_service
function
kubernetes_cluster
kubernetes_service
pod
vm
batch_job
workflow
legacy_api

database
relational_database
nosql_database
object_storage
file_storage
queue
topic
event_bus
cache
data_warehouse
legacy_database

identity_provider
oauth_provider
auth_service
service_account
iam_role
iam_policy
rbac_role
secret
certificate
token

vpc
subnet
nat
vpn
interconnect
direct_connect
private_link
vpc_peering
dns
router
network_boundary

logging
monitoring
alerting
tracing
ci_cd
repository
artifact_registry
```

### 17.6 Standard flows

```yaml
request
response
request_response
data_access
data_write
data_read
replication
sync
batch
event_publish
event_subscribe
message_send
message_receive
auth
token_issue
token_validate
permission_grant
admin_operation
deployment
monitoring
logging
network_route
security_scan
compliance_scan
telemetry_export
metrics_export
log_export
trace_export
```

---

## 18. Minimal example

```archmap
graph LR
  User[User] --> Web[Web App]
  Web -->|HTTPS + JWT| API[API Gateway]
  API --> App[Cloud Run]
  App -->|SQL| DB[(Cloud SQL)]
---
nodes:
  User: { zone: client, layer: client, kind: user }
  Web: { zone: client, layer: client, kind: web_app }
  API: { zone: gcp, layer: edge, kind: api_gateway, provider: gcp }
  App: { zone: gcp, layer: runtime, kind: serverless_service, provider: gcp, principal: app-sa }
  DB:  { zone: gcp, layer: data, kind: relational_database, provider: gcp }

edges:
  Web->API:
    flow: request
    protocol: HTTPS
    auth: { token: JWT, issuer: FirebaseAuth, validatedBy: API }
    boundaryCrossing: true

  App->DB:
    flow: data_access
    protocol: SQL
    principal: app-sa
    data: [customer_profile]

permissions:
  db_access:
    principal: app-sa
    action: connect
    resource: DB
    role: roles/cloudsql.client

data:
  customer_profile:
    label: Customer Profile
    classification: personal
    storedIn: [DB]
    flows: [App->DB]

zones:
  client: { label: Client, kind: client, contains: [User, Web] }
  gcp: { label: GCP, kind: cloud, provider: gcp, contains: [API, App, DB] }
```

---

## 19. Syntax acceptance criteria

The DSL syntax is acceptable when:

1. A Mermaid-like graph-only document renders.
2. A graph plus YAML metadata document parses reliably.
3. Users can progressively add metadata without changing graph notation.
4. Node IDs, edge forms, and top-level metadata keys are predictable.
5. Pair-key edges are convenient for simple cases.
6. Explicit edge IDs are available for stable semantic references.
7. Layers and zones are core syntax concepts.
8. Auth, data, boundary, and permission metadata are expressible without overloading graph labels.
9. Manual coordinates are not required.
10. Unsupported syntax produces diagnostics instead of silent misrendering.
