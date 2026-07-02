# ArchMap Syntax Reference (implemented)

This documents **what the current implementation actually parses, models, and
renders** — not the full v0.1 aspiration. For the language design see
[SPEC.md](../SPEC.md); for project status see [README.md](../README.md). If
you are prompting an AI agent to author a diagram, start with
[AI_AUTHORING_GUIDE.md](./AI_AUTHORING_GUIDE.md).

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

## Quick start

Use the graph section for the visible topology, then add YAML only when you
need semantic views, overlays, validation, routing metadata, or icon matching.

```archmap
graph LR
  User[User] -->|HTTPS + JWT| API[API Gateway]
  API -->|SQL| DB[(Cloud SQL)]
---
nodes:
  User: { zone: client, kind: user }
  API:  { zone: gcp, layer: edge, kind: api_gateway, provider: gcp }
  DB:   { zone: gcp, layer: data, kind: relational_database, provider: gcp }
edges:
  User->API:
    flow: request
    auth: { token: JWT, issuer: FirebaseAuth, validatedBy: API }
  API->DB:
    flow: data_access
    protocol: SQL
zones:
  client: { label: Client, kind: org_boundary, contains: [User] }
  gcp: { label: GCP, kind: cloud, provider: gcp, contains: [API, DB] }
```

Authoring rule of thumb:

- Start with `overview` and no Add info overlays; it should be a plain
  component diagram.
- Add `zone`, `boundary`, `auth`, `dataflow`, `permission`, and `validation`
  overlays only when you want those extra facts visible.
- Use `layer` only for Layer view. It is a stack partition, not a zone.
- Use `subgraph` for authoring hierarchy and abstraction. It does not imply a
  physical or logical area unless you also define a zone or boundary.
- Prefer explicit edge ids when multiple edges connect the same pair.

---

## Concepts

| Concept | Defined by | Purpose | Render behavior |
| --- | --- | --- | --- |
| Component / node | Graph node plus `nodes.*` metadata | A thing in the architecture | Always rendered unless collapsed into an abstraction component |
| Connector / edge | Graph arrow plus `edges.*` metadata | A relationship or flow between components | Rendered as component-safe orthogonal routes |
| Subgraph | `subgraph ... end` in graph section | Authoring hierarchy and optional abstraction | Add info `subgraph` shows a translucent grouping; collapsed subgraphs become one component |
| Zone | `zones.*` metadata | Physical or ownership area, such as client, GCP, AWS, on-prem | Add info `zone` shows nested areas; collapsed zones become one component |
| Boundary | `boundaries.*` metadata | Logical/trust/policy boundary | Add info `boundary` shows nested boundary areas and crossing context |
| Layer | `nodes.*.layer` | Layer view partition, such as application/framework/kernel | Used only by Layer view; it does not affect zone or boundary meaning |
| Add info overlay | `render(..., { overlays })` or viewer checkboxes | Adds semantic information to the base diagram | Additive; it should not replace the base component diagram |

`subgraph`, `zone`, and `boundary` are all user-authored. Overlay names,
render modes, diagnostic levels, and the standard validation vocabularies are
fixed by ArchMap, while `label`, `description`, `tags`, ids, zones,
boundaries, permissions, identities, data objects, and custom icon registrations
are user-controlled.

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
| Subgraph | `subgraph Name … end` | authoring hierarchy; can be shown by the `subgraph` overlay or collapsed as an abstraction |
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
    contains: [Child1]    # parsed/modelled; prefer zones/subgraphs for visual grouping
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
    contains: [API, App, DB]   # node ids or child zone ids
    parent: cloud              # optional alternative/companion to parent contains
    trustLevel: private
    description: "…"
```

### 2.4 `boundaries`
```yaml
boundaries:
  gcp_private:
    label: GCP Private
    kind: network_boundary
    contains: [App, DB]        # node ids, zone ids, or child boundary ids
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
layout:
  mode: auto
  direction: LR       # LR or TD; manual node positions are parsed but ignored
view:
  default:
    base: overview    # overview, layer, or prototype
    overlays: [zone]  # additive information layers
  enabled: [...]      # parsed, not applied yet
  filters: { zones: [...], layers: [...] }  # parsed, not applied yet
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
`boundary_cycle`, `scenario_unknown_start`, `scenario_unknown_step`,
`image_url_disallowed`.

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
`unknown_base_view`, `unknown_overlay`, `view_3d_unavailable`,
`hotspot_out_of_bounds`, `external_transition_without_boundary`.

**Suggestions:** `node_without_metadata`, `node_zone_unknown`,
`data_without_classification`, `dataflow_missing_storage`,
`telemetry_without_data_classification`, `placement_ref_unknown`,
`auth_token_without_recipient`, `scenario_incomplete`,
`screen_node_without_image`, `transition_without_trigger`,
`unreachable_screen`, `ambiguous_transition`.

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
nodes/edges, synthesize permission overlay edges, add compact badges, or draw
zone/boundary boxes. Unknown overlays emit `unknown_overlay` warnings and do not
block rendering.

`subgraph` and `zone` can both act as optional abstraction hierarchies. When
`render(model, { abstractionLevel, abstractionTarget })` or the viewer
Abstraction slider is set above `0`, groups at the selected depth become
abstraction components: contained nodes are hidden, external edges are rewired
from the group component, duplicate external edges collapse to one edge, and Add
info overlays use the same projected model. Level `1` collapses top-level
subgraphs/zones; level `2` collapses their child groups, and so on. The default
target is `subgraph`; use `abstractionTarget: "zone"` to collapse zones.
Collapsed abstraction components render with a heavier outline, and in an
interactive target they can be clicked to expand just that component/zone while
leaving sibling abstractions collapsed.

In the interactive viewer, zone and subgraph abstraction can also be managed by
clicking visible areas/components. The abstraction lock control disables those
open/close clicks when a read-only view is desired.

| View | Shows |
| --- | --- |
| `overview` | structural nodes/edges only until Add info overlays are enabled |
| `layer` / UI `Layer` | fixed stack bands from `nodes.*.layer`; zone and boundary do not change the stack partition |
| `zone` overlay | physical component areas from explicit `zones` metadata |
| `boundary` overlay | logical component areas from explicit `boundaries` metadata, plus boundary/zone-crossing edges; rest faded |
| `auth` | auth-related components/connectors and token/auth labels |
| `dataflow` | data-related components/connectors and data/classification labels |
| `permission` | permission-related components/connectors and role/action labels or summaries |
| `validation` | components/connectors referenced by diagnostics, with error/warning labels |
| `prototype` | ScreenFlow current screen, transitions, hotspots, scenario playback, and overlay summaries |
| `3d` | opt-in three.js view (layer → height, zone volumes, gizmo) |

**Layout behavior:** overview and layer views use automatic placement plus
component-safe orthogonal routing. Endpoints are distributed across component
sides, parallel lanes are offset, component intersections are repaired when
possible, and rendered SVG validation checks endpoint overlap, port spacing,
long segment overlap, component intersections, and perpendicular incidence.

**2D rendering order:** when multiple area overlays are enabled, areas are
drawn from back to front as zone → boundary → subgraph so more specific
grouping remains visible. Nested zones/boundaries are allowed.

---

## 6. JavaScript API

```js
import {
  parse, render, computeLayout,
  registerView, getView, listViews, initialize, defineArchMapViewerElement,
  createArchMapStream,
  registerIcon, getIcon, listIcons, clearIcons, resolveIcon, resolveNodeIcons,
  extractArchMapBlocks, version,
} from "@archmap/core";

const model = parse(source);                 // Text -> Model (+ errors/warnings)
const { svg } = render(model, { view: "overview", target: el });
const overlaid = render(model, { baseView: "overview", overlays: ["auth", "dataflow"] });
const abstracted = render(model, { baseView: "overview", abstractionLevel: 1 });
const zoneAbstracted = render(model, { baseView: "overview", abstractionTarget: "zone", abstractionLevel: 1 });
const partlyExpanded = render(model, { baseView: "overview", abstractionLevel: 1, expandedAbstractions: ["subgraph:Runtime"] });
overlaid.setOverlays(["permission", "validation"]);
overlaid.toggleOverlay("boundary");
abstracted.setAbstractionLevel(0);
await overlaid.downloadPng("archmap.png");
await overlaid.downloadSvg("archmap.svg");

const live = createArchMapStream({ target: el, renderOptions: { baseView: "overview" } });
live.write("graph LR\n");
live.write("  Web[Web App] --> API[API Gateway]\n");
await live.close();
```

- **Views** are pluggable: `registerView(name, ctx => svgString | { mount(el) })`.
- **Buffered streaming input** is available through
  `createArchMapStream({ target, renderOptions, debounceMs })`. It accepts
  `write(chunk)`, `pipe(readableStream)`, `flush()`, `close()`, and `abort()`.
  This is a buffered source interface, not an incremental parser: each flush
  reparses the complete accumulated source and supersedes the previous render.
- **Render results** can update base view/overlays/abstraction without reparsing:
  `setBaseView(view)`, `setOverlays(list)`, `toggleOverlay(name)`,
  `setAbstractionLevel(level)`, `setAbstractionTarget("subgraph" | "zone")`,
  `exportPng({ scale, background })`, `downloadPng(filename)`,
  `exportSvg()`, `downloadSvg(filename)`, `destroy()`.
- **Custom element (inline source):** `initialize()` defines
  `<archmap-viewer>` by default when `customElements` is available; call
  `defineArchMapViewerElement()` directly if you do not use `initialize()`.
  Supported first-pass attributes: `base-view`, `overlays`,
  `abstraction-level`, `abstraction-target`, `width`, `height`, `src`,
  `fallback-to-inline`, `diagnostics`, `diagnostics-target`, `console`,
  `controls`, `scenario`, and `show-hotspots`.
- **Controls + SVG interaction** (spec 03 §7 / TASK-006): `controls` shows
  tag-style controls (View radio buttons, Render mode radio buttons, Add info
  checkboxes, fit/reset, PNG export, full screen, abstraction lock, diagnostics
  indicator).
  The same tag UI is also available as a reusable browser control:
  `createDiagramTags({ target, state, onChange, onAction })` from
  `@archmap/core` or the CDN-friendly subpath
  `@archmap/core/controls/diagram-tags`.
  2D views support wheel zoom and drag pan; `render(model,{target})` attaches
  this automatically (`interactive: false` to disable), and
  `RenderResult.fit()/reset()` control the view.
  External `src` takes priority; failed loads emit `src_fetch_failed` and show
  diagnostics. Inline fallback is used only when `fallback-to-inline` is present.
- **Console diagnostics** (spec 02 §23): the viewer logs warnings+errors to the
  console by default (`console="false"` to silence). The programmatic
  `render(model, { console })` is opt-in; `reportDiagnosticsToConsole(model,
  opts)` exposes it directly (configurable `levels` and `logger`).
- **Icons** are opt-in (core ships none). `registerIcon("aws", { viewBox, body })`;
  resolved per node by `provider/kind` → `provider` → `kind`. Recommended source:
  [`@archmap/icons`](https://github.com/ai-org-labs/archmap-icons) — a verified
  drop-in (`installAwsIcons(registerIcon)`, etc.; AWS/GCP/Azure `provider/kind`
  icons + famous services). The bundled `@archmap/core/packs/cloud-icons` is a tiny sample.
- **3D / icon packs** live outside the core bundle:
  `import { installThreeView } from "@archmap/core/views3d/three-view"` (needs `three`),
  `import { installCloudIcons } from "@archmap/core/packs/cloud-icons"`.
- **Diagram tags** are exported for external playgrounds/viewers:
  `import { createDiagramTags } from "@archmap/core/controls/diagram-tags"`.
- **`initialize({ selector })`** scans the page and renders matching elements in
  place (also reads ```archmap``` fences via `extractArchMapBlocks`).

### 6.1 Browser viewer

`<archmap-viewer>` is the easiest browser embedding surface:

```html
<archmap-viewer
  base-view="overview"
  render-mode="2d"
  overlays="zone,auth,validation"
  controls
  diagnostics
  style="display:block;min-height:640px"
>
graph LR
  Web[Web App] -->|HTTPS + JWT| API[API Gateway]
---
nodes:
  Web: { zone: client, kind: web_app }
  API: { zone: gcp, kind: api_gateway, provider: gcp }
</archmap-viewer>
<script type="module">
  import { initialize } from "@archmap/core";
  initialize();
</script>
```

For external source files, use `src="diagram.archmap"`. Inline text is used as
fallback only when `fallback-to-inline` is present.

### 6.2 PNG export

All render results expose PNG export:

```ts
const result = render(model, { baseView: "overview", target: el });
const png = await result.exportPng({ scale: 2, background: "#ffffff" });
await result.downloadPng("architecture.png");
```

2D export converts the rendered SVG into a PNG canvas. 3D export captures the
current WebGL canvas view, including the current camera angle.

### 6.3 SVG export

SVG export is available for SVG-backed 2D views such as `overview` and `layer`.
Mounted views such as `prototype` and the optional `3d` view are not SVG-backed
and throw if `exportSvg()` is called.

```ts
const result = render(model, { baseView: "overview", target: el });
const svg = result.exportSvg();
await result.downloadSvg("architecture.svg");
```

### 6.4 Buffered streaming input

`createArchMapStream()` is the low-level interface for LLM/token-stream or live
source updates. It intentionally buffers text and reparses the full source at
flush boundaries, so callers get a stable API without requiring the parser to
be incremental.

```ts
const session = createArchMapStream({
  target: document.querySelector("#diagram"),
  renderOptions: { baseView: "overview", overlays: ["zone"] },
  debounceMs: 120,
  onResult: (result) => console.log(result.view),
});

session.write("graph LR\n");
session.write("  Web[Web App] --> API[API Gateway]\n");
session.flush();
await session.close();
```

`pipe(readableStream)` accepts `ReadableStream<string | Uint8Array>`. Use
`abort()` to cancel pending debounce work and destroy the current render.

### 6.5 Prototype View / ScreenFlow

ScreenFlow is enabled with top-level `mode: screenflow` or
`profile: screenflow` metadata. It reuses the normal graph: screen-like nodes
are screens, and edges are transitions.

```archmap
graph LR
  Home[Home] --> Product[Product Detail]
  Product --> Cart[Cart]
---
mode: screenflow
nodes:
  Home:
    kind: screen
    image: ./screens/home.svg
    frame: { device: mobile, width: 390, height: 844 }
  Product:
    kind: screen
    image: ./screens/product-detail.svg
    frame: { device: mobile, width: 390, height: 844 }
  Cart:
    kind: screen
edges:
  Home->Product:
    flow: navigate
    trigger: tap
    hotspot: { x: 36, y: 190, width: 318, height: 190 }
    transition: { type: fade, duration: 180 }
  Product->Cart:
    flow: submit
    trigger: tap
scenarios:
  happy_path:
    label: Purchase happy path
    start: Home
    steps: [Home->Product, Product->Cart]
view:
  default:
    base: prototype
    overlays: [dataflow, boundary, validation]
```

ScreenFlow node fields:

- `image`: screen capture, wireframe, or mock image URL.
- `frame.device`: optional device label.
- `frame.width` / `frame.height`: image-space size used for hotspot scaling
  and bounds validation.

ScreenFlow edge fields:

- `trigger`: `tap`, `click`, `submit`, `auto`, `redirect`, `back`, etc.
- `hotspot`: image-space rectangle `{ x, y, width, height }` on the source
  screen.
- `transition.type` / `transition.duration`: transition metadata retained in
  the model.

Scenarios define paper-prototype playback:

- `start`: starting screen node id.
- `steps`: edge explicit ids or pair keys such as `Home->Product`. Ambiguous
  pair keys emit `edge_pair_ambiguous`; use explicit edge ids when a pair has
  multiple transitions.

Prototype View has two modes:

- `Map`: the default view. Screen nodes are shown as image/fallback cards and
  transitions are drawn as arrowed lines from screen to screen.
- `Play`: paper-prototype playback. The current screen is shown large with
  hotspot navigation, outgoing transition buttons, and scenario controls.

Additional standard node kinds: `screen`, `page`, `tab`, `modal`, `dialog`,
`drawer`, `form`, `webview`, `external_page`, `auth_guard`, `error_screen`,
`completion_screen`, `activity`, `decision`, `start`, `end`.

Additional standard flows: `navigate`, `submit`, `back`, `redirect`,
`deep_link`, `open_modal`, `close_modal`, `switch_tab`, `auth_check`,
`api_call`, `success`, `error`, `auto`.

```ts
const result = render(model, {
  baseView: "prototype",
  overlays: ["dataflow", "boundary", "validation"],
  scenario: "happy_path",
  showHotspots: true,
  target: el,
});

result.next?.();
result.back?.();
result.goToScreen?.("Cart");
```

### 6.4 CDN / GitHub Pages viewer

For a static viewer page, use an import map. After npm publication, replace
`0.1.1` with the published version you want to pin:

```html
<script type="importmap">
{
  "imports": {
    "@archmap/core": "https://cdn.jsdelivr.net/npm/@archmap/core@0.1.1/dist/archmap.js",
    "@archmap/core/controls/diagram-tags": "https://cdn.jsdelivr.net/npm/@archmap/core@0.1.1/dist/controls/diagram-tags.js",
    "@archmap/core/views3d/three-view": "https://cdn.jsdelivr.net/npm/@archmap/core@0.1.1/dist/views3d/three-view.js",
    "three": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js",
    "three/": "https://cdn.jsdelivr.net/npm/three@0.185.0/",
    "@archmap/icons": "https://cdn.jsdelivr.net/npm/@archmap/icons@0.1.1/+esm"
  }
}
</script>
<script type="module">
  import { initialize, registerIcon } from "@archmap/core";
  import { installCloudProviderIcons } from "@archmap/icons";
  import { installThreeView } from "@archmap/core/views3d/three-view";

  installCloudProviderIcons(registerIcon);
  installThreeView();
  initialize();
</script>
```

---

## 7. Not yet supported / intentionally constrained

Parsed/modeled but **not rendered**: node `contains` nesting, manual `layout`
positions, `view.enabled` / `view.filters`.

Security constraints: user-authored Markdown/HTML labels are not supported; URL
fields are not rendered as clickable links. If either is added later, it needs a
documented sanitizer/protocol allowlist first.
