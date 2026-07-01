# AI Authoring Guide for ArchMap

Use this guide when an AI agent is asked to write a system architecture diagram
in the ArchMap format for `@archmap/core` v0.1.x, for example:

> Write a system architecture diagram in the ArchMap format from
> https://github.com/ai-org-labs/archmap/tree/v0.1.0

This guide is optimized for fast authoring and information gathering. The
definitive parser/render reference remains [SYNTAX.md](./SYNTAX.md).

## What To Produce

Return one fenced `archmap` block unless the user asks for prose too:

````markdown
```archmap
graph LR
  User[User] -->|HTTPS + JWT| Web[Web App]
  Web -->|HTTPS + JWT| API[API Gateway]
  API -->|SQL| DB[(Cloud SQL)]
---
nodes:
  User: { kind: user, zone: client, layer: client }
  Web: { kind: web_app, zone: client, layer: client }
  API: { kind: api_gateway, provider: gcp, zone: gcp_edge, layer: edge }
  DB: { kind: relational_database, provider: gcp, zone: gcp_data, layer: data }
edges:
  Web->API:
    flow: request
    auth: { token: JWT, issuer: FirebaseAuth, validatedBy: API }
    boundaryCrossing: true
  API->DB:
    flow: data_access
    protocol: SQL
zones:
  client: { label: Client, kind: org_boundary, contains: [User, Web] }
  gcp_edge: { label: GCP Edge, kind: cloud, provider: gcp, contains: [API] }
  gcp_data: { label: GCP Data, kind: cloud, provider: gcp, contains: [DB] }
view:
  default:
    base: overview
    overlays: [zone, auth, dataflow, boundary, validation]
```
````

The graph section is the visible topology. The YAML section is the semantic
model used by overlays, diagnostics, icons, abstraction, stack view, 3D view,
and ScreenFlow prototype view.

## Fast Information Checklist

Collect only the facts needed for a useful first diagram. Ask blocking
questions only when the answer changes the architecture; otherwise make a
clearly marked assumption.

- Scope: product, subsystem, environment, or user flow being diagrammed.
- Actors: end users, admins, internal operators, partner systems.
- Clients: web app, mobile app, CLI, device, backend client.
- Edge entry points: DNS, CDN, WAF, load balancer, API gateway, ingress.
- Runtime components: services, functions, jobs, workers, schedulers, queues.
- Data components: databases, object storage, cache, search, warehouse, logs.
- External systems: IdP, payment, SaaS, monitoring, security scanners, vendors.
- Auth: token type, issuer, validator, login redirects, service accounts.
- Dataflow: data objects, classification, producer, consumer, storage.
- Boundaries: trust, network, organization, cloud account/project, SaaS, on-prem.
- Permissions: principal, action, resource, role.
- ScreenFlow: screens, images, hotspots, triggers, scenarios, error paths.
- Unknowns: keep them visible as `TODO` descriptions or assumptions instead of
  inventing secret names, exact IAM roles, endpoints, or compliance status.

## Core Syntax Rules

- Start with `graph LR` for most architecture diagrams.
- Use stable ASCII ids such as `Web`, `APIGW`, `CloudSQL`, `PaymentProvider`.
- Put human-readable names in labels: `APIGW[API Gateway]`.
- Separate graph and metadata with a line containing only `---`.
- Prefer one real component per node. Do not encode layout with coordinates.
- Add explicit metadata for every important node and edge.
- Use explicit edge metadata when an edge has auth, data, permission, boundary,
  protocol, trigger, or validation meaning.
- If multiple edges connect the same node pair, give them explicit ids in
  `edges:` instead of relying only on `Source->Target` pair matching.

## Concepts To Use Correctly

| Concept | Use it for | Do not use it for |
| --- | --- | --- |
| `subgraph` | Authoring hierarchy, abstraction, collapse/expand | Physical or trust grouping by itself |
| `zone` | Physical/ownership/component area; nested zones are allowed | Stack partitions |
| `boundary` | Logical, trust, policy, network, SaaS, or external crossing area; nested boundaries are allowed | Runtime placement |
| `layer` | Stack view partition such as app/framework/library/kernel/data | Zone or boundary semantics |
| `auth` overlay | Token, issuer, validator, login/auth checks | General request labels |
| `dataflow` overlay | Data objects, classification, storage, producer/consumer | Every ordinary request |
| `permission` overlay | Principal, action, resource, role | Authentication token details |
| `validation` overlay | Warnings/errors/assumptions and model quality | Business status |

Base views are `overview`, `stack`, and `prototype`. Render modes are `2d` and
`3d`. Add info overlays are `subgraph`, `zone`, `auth`, `dataflow`, `boundary`,
`permission`, and `validation`.

## Useful Vocabulary

Prefer standard vocabulary when possible because it improves validation and
icons. Custom values are allowed, but should be intentional.

Common node kinds:

- People/apps: `user`, `admin_user`, `web_app`, `mobile_app`, `android_app`,
  `client_app`
- Edge/runtime: `api_gateway`, `load_balancer`, `serverless_service`,
  `runtime_service`, `kubernetes_cluster`, `worker`, `scheduler`
- Data: `relational_database`, `object_storage`, `cache`, `search`,
  `message_queue`, `data_warehouse`
- Security/ops: `identity_provider`, `service_account`, `monitoring`,
  `security_scanner`
- ScreenFlow: `screen`, `page`, `tab`, `modal`, `dialog`, `drawer`, `form`,
  `webview`, `external_page`, `auth_guard`, `error_screen`,
  `completion_screen`, `decision`, `start`, `end`

Common flows:

- Architecture: `request`, `data_access`, `replication`, `telemetry_export`,
  `log_export`, `trace_export`, `security_scan`, `token_issue`,
  `token_validate`, `permission_grant`, `admin_operation`
- ScreenFlow: `navigate`, `submit`, `back`, `redirect`, `deep_link`,
  `open_modal`, `close_modal`, `switch_tab`, `auth_check`, `api_call`,
  `success`, `error`, `auto`

## Metadata Patterns

### Auth

Keep one auth fact together on the edge:

```yaml
edges:
  Web->API:
    label: HTTPS + JWT
    flow: request
    auth: { token: JWT, issuer: FirebaseAuth, validatedBy: API }
```

### Dataflow

Define the data object once, then reference producers, consumers, and storage:

```yaml
data:
  customer_profile:
    label: Customer Profile
    classification: personal
    producedBy: Web
    consumedBy: [API]
    storedIn: [DB]
```

### Boundary Crossing

Mark external, trust, cloud, SaaS, or on-prem crossings:

```yaml
edges:
  API->PaymentProvider:
    flow: request
    protocol: HTTPS
    boundaryCrossing: true
```

### Permission

```yaml
permissions:
  api_reads_db:
    principal: app-sa
    action: connect
    resource: DB
    role: roles/cloudsql.client
```

### ScreenFlow / Prototype

Use `mode: screenflow` or `profile: screenflow`, screen-like nodes, transition
edges, optional hotspots, and scenarios:

```yaml
mode: screenflow
nodes:
  Home:
    kind: page
    image: ./screens/home.svg
    frame: { device: mobile, width: 390, height: 844 }
edges:
  Home->ProductDetail:
    trigger: tap
    hotspot: { x: 40, y: 180, width: 300, height: 120 }
scenarios:
  happy_path:
    label: Purchase happy path
    start: Home
    steps: [Home->ProductDetail, ProductDetail->Cart, Cart->Checkout]
view:
  default:
    base: prototype
    overlays: [dataflow, boundary, validation]
```

## Quality Checklist Before Answering

- Every graph node that matters has `nodes.*` metadata.
- Edge metadata `from` / `to` ids, pair keys, and scenario steps refer to real
  graph nodes/edges.
- Auth `issuer` and `validatedBy` refer to real nodes when known.
- External or trust-zone crossings have `boundaryCrossing: true`.
- Zones and boundaries contain real node or zone ids.
- Data objects name classification, producer/consumer, and storage when known.
- Permissions identify principal, action, resource, and role when known.
- The diagram uses semantic metadata instead of pixel positioning.
- Unknown facts are marked as assumptions/TODOs, not silently invented.
- If tooling is available, run the source through `parse(source)` or the
  playground and fix diagnostics.

## Copy-Paste Prompt For Another AI

Use this prompt when delegating ArchMap authoring:

```text
You are writing ArchMap DSL for @archmap/core v0.1.x.
Read the system description and produce one fenced ```archmap block.
Use graph LR plus YAML metadata after ---.
Collect or infer: actors, clients, entry points, runtimes, data stores,
external systems, auth, dataflow, boundaries, permissions, and unknowns.
Use zone for physical/ownership grouping, boundary for logical/trust/policy
grouping, layer only for Stack view, and subgraph only for authoring hierarchy.
Prefer standard node kind and flow vocabulary from docs/AI_AUTHORING_GUIDE.md.
Do not invent secrets or exact cloud roles. Mark assumptions explicitly.
Before finalizing, check that ids resolve, auth references real nodes, external
crossings are marked, and no pixel layout instructions are used.
```
