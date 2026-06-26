# ArchMap Syntax Reference (implemented)

This documents **what the current implementation actually parses, models, and
renders** — not the full v0.1 aspiration. For the language design see
[SPEC.md](../SPEC.md); for project status see [README.md](../README.md).

A document is a **graph section** followed by an optional **YAML metadata
section**, separated by a line containing only `---`:

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
```
````

---

## 1. Graph section

| Feature | Syntax | Notes |
| --- | --- | --- |
| Direction | `graph LR` / `graph TD` | `flowchart` and `TB` (→TD) also accepted. Missing → defaults to `LR` (warning). |
| Rectangle node | `A[Label]` | |
| Database node | `A[(Label)]` | cylinder |
| Circle node | `A((Label))` | ellipse |
| Diamond node | `A{Label}` | |
| Bare reference | `A` | reuses a node defined elsewhere |
| Plain edge | `A --> B` | |
| Labeled edge | `A -->\|Label\| B` | |
| Subgraph | `subgraph Name … end` | becomes a **zone** (flat) if not redefined in metadata |
| Comment | `%% …` | stripped |

**Node IDs**: start with an ASCII letter; then letters, digits, `_`, `-`.
A node is *defined* by a token carrying a shape (`A[…]`); repeating a definition
is a `duplicate_node` error. One arrow per line.

Edges in the graph are reconciled with metadata edges by their `(from, to)`
pair: a matching metadata edge adopts the graph label and its explicit id;
unmatched graph edges get a generated id `from_to`.

---

## 2. Metadata section (YAML)

Top-level keys parsed today: `title`, `description`, `nodes`, `edges`, `zones`,
`boundaries`, `identities`, `permissions`, `data`, `layout`, `view`.

### 2.1 `nodes`
```yaml
nodes:
  App:
    label: Cloud Run      # overrides graph label
    zone: gcp
    layer: runtime
    kind: serverless_service
    provider: gcp
    principal: app-sa
    contains: [Child1]    # parsed, but NOT yet rendered as nesting (backlog)
    tags: [public, prod]
    description: "…"
```

### 2.2 `edges`
Two forms (spec 01 §7 / 02 §6):

- **Pair-key** `Source->Target:` — selects the matching graph edge and enriches
  it (keeps a generated id `from__to__index`; not a stable id). Ambiguous if it
  matches multiple graph edges (`edge_pair_ambiguous`).
- **Explicit-id** — the key is a stable id; `from`/`to` required. Use for
  multiple edges between the same pair or stable `data.flows` references.

```yaml
edges:
  Web->API: { flow: request, protocol: HTTPS }   # pair-key form
  web_api_admin: { from: Web, to: API, flow: admin_operation }   # explicit-id
```
```yaml
edges:
  web_api:
    from: Web
    to: API
    label: HTTPS + JWT
    flow: request
    protocol: HTTPS
    auth: { method: bearer, token: JWT, issuer: FirebaseAuth, audience: api,
            validatedBy: API, scopes: [read], claims: {…} }
    principal: app-sa
    data: …               # free-form, stored as-is
    networkPath: [VPN, Firewall]
    boundaryCrossing: true # boolean or list
    direction: request_response
    tags: […]
    description: "…"
```

### 2.3 `zones`
```yaml
zones:
  gcp:
    label: GCP
    kind: cloud
    provider: gcp
    contains: [API, App, DB]   # node ids (zone-in-zone not supported)
    trustLevel: private
    description: "…"
```

### 2.4 `boundaries`
```yaml
boundaries:
  gcp_private:
    label: GCP Private
    kind: network_boundary
    contains: [App, DB]        # node ids OR boundary ids (nested refs resolved
                               #   into the box; nested *rendering* is backlog)
    zone: gcp
    description: "…"
```

### 2.5 `identities`
```yaml
identities:
  app-sa: { kind: service_account, provider: gcp, attachedTo: App }
```
`attachedTo` may be a string or list.

### 2.6 `permissions`
```yaml
permissions:
  cloudsql:
    principal: app-sa   # required
    action: connect     # required
    resource: DB        # required
    effect: allow
    role: roles/cloudsql.client
    condition: …
    description: "…"
```

### 2.7 `data`
```yaml
data:
  customer_profile:
    label: Customer Profile
    classification: personal   # shown as a node badge in the Data Flow view
    storedIn: [DB, RDS]
    processedBy: [App]
    flows: [web_api, app_db]
    retention: 30d
    description: "…"
```

### 2.8 `layout` and `view` (parsed, partially applied)
```yaml
layout: { mode: auto, direction: LR, nodes: { … } }   # parsed but renderer
                                                       # ignores manual positions
view:
  default: overview     # honored by render()
  enabled: [...]        # parsed, NOT yet applied
  filters: { zones: [...], layers: [...] }  # parsed, NOT yet applied
```

---

## 3. Label inference

Filled only when the field isn't set explicitly; each inferred field is listed
in the edge's `inferred[]` so it's visible.

| Label matches | Inferred |
| --- | --- |
| `https` | `protocol: HTTPS` |
| `http` (word) | `protocol: HTTP` |
| `sql` (word) | `protocol: SQL` |
| `jwt` | `auth.token: JWT` |
| `oauth` | `auth.method: oauth` |
| `pub/sub` | `flow: event_publish` |
| `sqs` (word) | `flow: message_send` |
| `replication` | `flow: replication` |
| `sync` (word) | `flow: sync` |

Protocol precedence: HTTPS before HTTP.

---

## 4. Validation

Attached to the model as `diagnostics`, with derived `errors`, `warnings`,
`suggestions`, and `infos` arrays. Each diagnostic has a `level`, `code`,
`message`, optional legacy `ref`, and spec-shaped `target`.

**Errors:** `invalid_node_id`, `duplicate_node`, `invalid_yaml`,
`metadata_not_object`, `edge_missing_endpoint`, `edge_unknown_source`,
`edge_unknown_target`, `zone_parent_conflict`, `zone_cycle`,
`boundary_cycle`.

**Warnings:** `unparsed_line`, `metadata_node_not_in_graph`,
`unknown_node_kind`, `unknown_layer`, `unknown_flow`,
`unknown_zone_kind`, `unknown_boundary_kind`, `unknown_identity_kind`,
`unknown_classification`, `edge_pair_ambiguous`, `edge_unknown_data`,
`data_flow_mismatch`, `data_flow_ambiguous`, `auth_flow_without_token`,
`auth_token_without_issuer`,
`auth_token_without_validator`, `auth_unknown_issuer`,
`auth_unknown_validator`, `auth_unknown_recipient`,
`zone_crossing_without_boundary`,
`zone_crossing_marked_false`, `data_access_without_principal`,
`permission_incomplete`, `permission_unknown_principal`,
`permission_unknown_resource`, `data_unknown_flow`, `data_unknown_node`,
`zone_unknown_node`, `zone_unknown_child_zone`, `zone_parent_unknown`,
`boundary_unknown_node`, `boundary_unknown_zone`,
`boundary_unknown_boundary`, `boundary_unknown_related_zone`,
`unknown_base_view`, `unknown_overlay`, `view_3d_unavailable`.

**Suggestions:** `node_without_metadata`, `node_zone_unknown`,
`data_without_classification`, `dataflow_missing_storage`,
`telemetry_without_data_classification`, `placement_ref_unknown`,
`auth_token_without_recipient`.

**Infos:** `missing_direction`, `inferred_protocol`, `inferred_auth_token`,
`inferred_flow`, `inferred_zone`.

`kind` / `layer` / `flow` are validated against the standard vocabularies in
`src/types.ts` (`STANDARD_KINDS`, `STANDARD_LAYERS`, `STANDARD_FLOWS`); unknown
values are allowed but warned.

---

## 5. Views

Set with `render(model, { view })` or the `view.default` key. All are SVG except
`3d`.

Stage 4 also accepts `render(model, { baseView, overlays })`. `baseView`
selects the base renderer while `overlays` applies semantic projections from
the same parsed model without reparsing. Known overlays are recorded on the SVG
root (`data-overlays`, `archmap-overlay-*`) and can emphasize relevant
nodes/edges, add compact badges, or draw boundary boxes. Unknown overlays emit
`unknown_overlay` warnings and do not block rendering.

| View | Shows |
| --- | --- |
| `overview` | all nodes/edges + zone boxes |
| `zone` | nodes banded by zone (recommended order), cross-zone edges emphasized |
| `auth` | identity/auth/user nodes + token-carrying & auth-flow edges; rest faded |
| `dataflow` | storage nodes + data-carrying edges; classification badges; rest faded |
| `boundary` | boundary boxes + boundary/zone-crossing edges; rest faded |
| `validation` | nodes/edges referenced by diagnostics flagged |
| `3d` | opt-in three.js view (layer → height, zone volumes, gizmo) |

**Layout behavior:** zones are laid out as swimlanes (so zone boxes don't
overlap); edges route orthogonally — same-lane left/right, adjacent-lane direct
top/bottom drops, 2+ lanes apart via a column-gap trunk; crossing horizontal
lines get a small jump gap.

---

## 6. JavaScript API

```js
import {
  parse, render, computeLayout,
  registerView, getView, listViews, initialize,
  registerIcon, getIcon, listIcons, clearIcons, resolveIcon, resolveNodeIcons,
  extractArchMapBlocks, version,
} from "archmap";

const model = parse(source);                 // Text -> Model (+ errors/warnings)
const { svg } = render(model, { view: "overview", target: el });
const overlaid = render(model, { baseView: "overview", overlays: ["auth", "dataflow"] });
```

- **Views** are pluggable: `registerView(name, ctx => svgString | { mount(el) })`.
- **Icons** are opt-in (core ships none). `registerIcon("aws", { viewBox, body })`;
  resolved per node by `provider/kind` → `provider` → `kind`. Recommended source:
  [`@archmap/icons`](https://github.com/ai-org-labs/archmap-icons) — a verified
  drop-in (`installAwsIcons(registerIcon)`, etc.; AWS/GCP/Azure `provider/kind`
  icons + famous services). The bundled `archmap/packs/cloud-icons` is a tiny sample.
- **3D / icon packs** live outside the core bundle:
  `import { installThreeView } from "archmap/views3d/three-view"` (needs `three`),
  `import { installCloudIcons } from "archmap/packs/cloud-icons"`.
- **`initialize({ selector })`** scans the page and renders matching elements in
  place (also reads ```archmap``` fences via `extractArchMapBlocks`).

---

## 7. Not yet supported

Parsed/modeled but **not rendered**: node `contains` nesting, nested boundary
rendering, manual `layout` positions, `view.enabled` / `view.filters`. Not
modeled: zone-in-zone. (Nesting is tracked in the backlog.)
