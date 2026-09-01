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
model used by overlays, diagnostics, icons, abstraction, Layer view, 3D view,
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
- Evolution (4D): migration/rollout phases, which components appear or retire
  when, deprecated/planned states — model with `timeline:` phases plus
  per-element `lifecycle: { added, removed, states }` (see
  `docs/specs/v0.2/06-timeline-4d.md`).
- Unknowns: keep them visible as `TODO` descriptions or assumptions instead of
  inventing secret names, exact IAM roles, endpoints, or compliance status.

## Core Syntax Rules

- Start with `graph LR` for most architecture diagrams.
- Use stable ASCII ids such as `Web`, `APIGW`, `CloudSQL`, `PaymentProvider`.
- Put human-readable names in labels: `APIGW[API Gateway]`.
- For a deliberately multi-line component name, write `APIGW[API Gateway\n(public)]`.
  Keep the stable ID unchanged and use line breaks sparingly for readability.
- Connector labels follow the same rule: write `Client -->|request\nvalidated| APIGW`,
  or use a YAML block scalar in `edges.*.label`. Keep compact graph edges on one source line.
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
| `subgraph` | Authoring hierarchy, abstraction, collapse/expand; structural groups may intersect | Physical or trust grouping by itself |
| `zone` | Exclusive physical/ownership/component area; sibling zones do not intersect, while nested parent-child zones are allowed | Layer partitions or overlapping structural concerns |
| `boundary` | Logical, trust, policy, network, SaaS, or external crossing area; nested boundaries are allowed | Runtime placement |
| `layer` | Contiguous Layer-view swimlane such as actor/team/system or app/framework/library/kernel/data | Zone or boundary semantics |

For a horizontal business-flow table, use `graph LR`; Layer renders horizontal
lanes with no gutter. For a vertical-column swimlane, use `graph TD` (or `TB`);
Layer renders contiguous vertical lanes. Assign every participating node a
`layer` and let the graph edges describe the workflow across lane boundaries.
| `auth` overlay | Token, issuer, validator, login/auth checks | General request labels |
| `dataflow` overlay | Data objects, classification, storage, producer/consumer | Every ordinary request |
| `permission` overlay | Principal, action, resource, role | Authentication token details |
| `validation` overlay | Warnings/errors/assumptions and model quality | Business status |

Base views are `overview`, `topology`, `layer`, and `prototype`. Render modes are `2d` and
`3d`. Add info overlays are `subgraph`, `zone`, `auth`, `dataflow`, `boundary`,
`permission`, and `validation`.

### Zone vs Subgraph

Use this question first:

> If two rendered groups overlap, would a reader misunderstand where a component
> belongs or which deployment/ownership area it occupies?

- **Yes: use `zone`.** A zone is a placement or ownership region whose boundary
  carries architectural meaning. Sibling zones are mutually exclusive and the
  Topology view keeps them non-intersecting with visible clearance. Parent-child
  zones are the intentional exception: they overlap by containment because the
  child belongs inside the parent. Zone overlays render as lightly filled,
  borderless areas; use a `boundary` if the visual outline is meaningful.
- **No: use `subgraph`.** A subgraph is an authoring and abstraction group. Its
  unfilled dashed outline may cross another subgraph because it communicates a
  structural relationship, not exclusive spatial membership.

Typical `zone` examples are cloud regions, availability zones, accounts,
projects, VPCs, subnets, on-premises sites, environments, and ownership areas.
Typical `subgraph` examples are request paths, feature slices, processing
pipelines, scenarios, related services, and source-level organization.

The two can be used together. For example, define Tokyo and Virginia as sibling
zones, then use a `CheckoutFlow` subgraph for components participating in the
same flow across both zones. Do not replace the zones with overlapping
subgraphs when the diagram must communicate exclusive placement.

### ArchMap Next Canonical Terms

ArchMap Next separates authored compatibility syntax from the canonical model
used for topology analysis. Use these meanings when generating or reviewing a
document:

| Authored syntax | Next canonical meaning | Analysis rule |
| --- | --- | --- |
| `nodes` | Resources | The only valid communication endpoints |
| `zone` / `zones` | Container Boundaries | Actual containment; one direct parent; siblings are non-intersecting |
| `boundary` / `boundaries` | Overlay Boundaries | Semantic sets; membership and visual regions may overlap |
| `subgraph` | Authoring/abstraction group | No containment or crossing semantics |
| `layer` | Layer-view partition | No containment or crossing semantics |

An Edge describes one direct Resource-to-Resource communication. Do not use a
Container or Overlay as an endpoint, and do not skip a real intermediary such
as a gateway or load balancer. Container Crossings and Overlay Transitions are
derived by ArchMap; authors must not encode them as substitute edges. Legacy
`boundaryCrossing` remains only a compatibility assertion checked against the
derived result.

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

### Runtime View

Use `runtime:` when the document needs an operational snapshot without leaving
the ArchMap DSL. Runtime View is not a live observability connector. A person or
AI writes the snapshot and identifies the provenance of every value:

- `measured`: copied from a real measurement or report.
- `estimated`: inferred or calculated; do not present it as observed fact.
- `declared`: intentional design/operational metadata with no measurement claim.

Reference existing architecture node ids from `runtime.services` and
`runtime.dependencies`. Prefer a bounded `window`, include `capturedAt`, and
use `no-data` instead of inventing a value. Do not claim that values are live,
and do not fabricate evidence. Runtime events should include `target`, `at`,
`type`, and a concise `label`.

Use Runtime View for health, traffic, latency, saturation, recent events, and
Design/Runtime/Diff comparison. Use Overview or Topology for intended
structure. The same DSL remains the source of truth for both.

### ArchMap Next topology and boundary analysis

When the request asks which real communications cross network, security,
administrative, compliance, or ownership boundaries, prefer the native
`topology:` section.

- Write every endpoint-capable entity under `topology.resources`.
- Give each Resource only its direct `parent` Container, or `null`.
- Write structural ownership/placement under `topology.containers`; Containers
  are a forest and sibling Containers do not semantically overlap.
- Write overlapping concerns such as PCI, production, personal data, or team
  ownership under `topology.overlays` with explicit members.
- Write one `topology.edges` entry for every real direct communication hop.
  `Client -> LB -> API` requires two Edges; never collapse it to
  `Client -> API`.
- Never write Crossings or Overlay Transitions. ArchMap derives them by
  comparing endpoint membership. Layout and dragging do not change them.
- `enforcedBy` associates a Container with enforcing Resources but does not
  claim that traffic traverses an invisible hop. Leave route consistency to a
  validator or explicit path context.
- Do not use Container or Overlay IDs as Edge endpoints.

Legacy `nodes` / `zones` / `boundaries` documents remain valid. Do not mix the
two authoring models merely to duplicate facts; native topology is projected
to legacy renderer collections automatically.

### Requirements and lifecycle traceability

When the request includes requirements, acceptance, quality evidence, risk, or
traceability, write stable lifecycle IDs and connect them to existing
architecture nodes. Prefer one complete vertical slice over many disconnected
records:

```yaml
requirements:
  REQ-LOGIN: { title: User can sign in, type: functional, status: approved }
acceptanceCriteria:
  AC-LOGIN: { requirement: REQ-LOGIN, statement: Valid sign-in opens Home }
tests:
  TEST-LOGIN: { title: Login E2E, type: end_to_end, required: true }
evidence:
  EVD-LOGIN: { type: test_result, status: passed, producedBy: TEST-LOGIN, source: artifacts/login.json }
relations:
  - { from: REQ-LOGIN, to: Login, type: realized_by }
  - { from: AC-LOGIN, to: TEST-LOGIN, type: verified_by }
  - { from: TEST-LOGIN, to: EVD-LOGIN, type: evidenced_by }
```

Use `requirements`, `acceptanceCriteria`, `decisions`, `risks`, `tests`,
`evidence`, and `relations` only when `@archmap/lifecycle` is available. Never
invent passed Evidence, approvals, owners, or dates. Unknown facts remain
omitted or explicitly proposed; evidence must refer to a real inert artifact
location supplied by the user or tool output.

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
- Lifecycle IDs are stable, relation endpoints exist, and each claimed
  Requirement -> Acceptance Criterion -> Test -> Evidence chain is truthful.
- Native topology Edges connect Resources only, represent direct hops, and do
  not contain authored Crossing or Transition output.
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
grouping, layer only for Layer view, and subgraph only for authoring hierarchy.
Sibling zones represent exclusive areas and must not overlap; nested
parent-child zones may overlap by containment. Subgraphs are structural,
unfilled dashed groups and may intersect. If overlapping groups would create
ambiguity about placement or ownership, model them as zones rather than
subgraphs.

Choose `topology` for containment-first deployment or cloud diagrams with
repeated regions, availability zones, subnets, or ownership blocks. Use
`subgraph` for unfilled dashed structural grouping and `zone` for lightly filled
physical/ownership areas. The golden grid is automatic; add integer-cell
`layout.grid.placements` only when a stable editorial anchor is required.
Prefer standard node kind and flow vocabulary from docs/AI_AUTHORING_GUIDE.md.
Do not invent secrets or exact cloud roles. Mark assumptions explicitly.
Before finalizing, check that ids resolve, auth references real nodes, external
crossings are marked, and no pixel layout instructions are used.
```
