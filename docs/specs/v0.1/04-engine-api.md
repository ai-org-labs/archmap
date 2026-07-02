# ArchMap Rendering Engine and API Specification

Status: Draft v0.1  
Scope: Browser runtime, HTML embedding, JavaScript API, rendering lifecycle, diagnostics, security, delivery modes

This document defines how ArchMap DSL is rendered in a browser and how applications integrate with the renderer.

---

## 1. Purpose

The ArchMap rendering engine turns an ArchMap source block into an interactive architecture diagram.

The engine is responsible for:

- finding ArchMap blocks in HTML
- reading inline or external sources
- parsing ArchMap DSL
- building the canonical semantic model
- validating the model
- rendering a base view
- applying overlays
- displaying UI controls
- supporting pan, zoom, resize, and 3D interaction
- showing validation diagnostics
- emitting integration events

The engine should work in a browser without a backend server.

---

## 2. Delivery modes

ArchMap should support multiple delivery modes.

### 2.1 CDN usage

ArchMap can be loaded from a CDN.

```html
<script type="module">
  import { initialize } from "https://cdn.example.com/archmap/archmap.esm.js";

  initialize();
</script>
```

CDN usage should support:

- static HTML pages
- Markdown-generated HTML
- documentation sites
- local HTML files when dependencies are already available

### 2.2 npm usage

ArchMap can be installed as an npm package.

```bash
npm install @archmap/core
```

```js
import { parse, render, initialize } from "@archmap/core";
```

### 2.3 Local standalone usage

ArchMap can be used from local files.

```html
<script type="module" src="./archmap.esm.js"></script>
```

The renderer should not require a backend server.

---

## 3. Package structure

A complete ArchMap distribution must provide the required product capabilities, including 3D.

The implementation may split bundles for performance.

Recommended package structure:

```text
archmap
  core parser/model/validation
  svg renderer
  built-in overview view
  built-in zone view
  built-in overlays
  3D renderer or lazy-loadable 3D bundle
```

3D may live in a separate lazy-loaded bundle, but `3d` remains a required built-in base view name for a complete product distribution.

If the 3D renderer cannot be loaded, the engine must emit `view_3d_unavailable` and show a clear fallback state.

---

## 4. HTML embedding

ArchMap should support declarative embedding in HTML.

### 4.1 Recommended custom element

```html
<archmap-viewer
  base-view="overview"
  overlays="auth,dataflow,boundary"
  width="100%"
  height="640px"
  controls="true"
>
graph LR
  Web[Web App] -->|HTTPS + JWT| API[API Gateway]
  API --> App[Cloud Run]
  App --> DB[(Cloud SQL)]
---
nodes:
  Web: { zone: client, layer: client, kind: web_app }
  API: { zone: gcp, layer: edge, kind: api_gateway }
  App: { zone: gcp, layer: runtime, kind: serverless_service }
  DB:  { zone: gcp, layer: data, kind: relational_database }
</archmap-viewer>
```

The custom element is the preferred long-term embedding API.

### 4.2 Code block enhancement

ArchMap should also support enhancement of code blocks.

```html
<pre><code class="language-archmap">
graph LR
  Web[Web App] --> API[API Gateway]
---
nodes:
  Web: { zone: client, layer: client, kind: web_app }
  API: { zone: gcp, layer: edge, kind: api_gateway }
</code></pre>
```

`initialize()` may replace matching code blocks with interactive ArchMap viewers.

### 4.3 Plain container rendering

The engine should support explicit rendering into a target element.

```html
<div id="target"></div>
```

```js
import { parse, render } from "@archmap/core";

const model = parse(source);

render(model, {
  target: document.getElementById("target"),
  baseView: "overview",
  overlays: ["auth", "dataflow"]
});
```

---

## 5. Viewer size

The viewer should support explicit and responsive sizing.

### 5.1 Supported sizing options

```html
<archmap-viewer width="100%" height="640px"></archmap-viewer>
```

Supported values:

- CSS length: `640px`, `40rem`
- percentage: `100%`
- viewport units: `80vh`
- `auto`

### 5.2 Parent-based sizing

If `width="100%"`, the viewer should fit its parent width.

If `height` is omitted, the default height should be used.

Recommended default:

```text
width: 100%
height: 600px
```

### 5.3 Resize behavior

The viewer should observe container resize and re-render or resize the viewport.

Requirements:

- SVG views should update their viewport size.
- 3D views should update camera aspect ratio and renderer size.
- The current pan, zoom, and camera state should be preserved when possible.

---

## 6. Base views and overlays

### 6.1 Base views

Built-in base views:

```text
overview
zone
3d
```

`3d` is required.

### 6.2 Overlays

Built-in overlays:

```text
auth
dataflow
boundary
permission
validation
```

### 6.3 Render API

```js
render(model, {
  target: el,
  baseView: "overview",
  overlays: ["auth", "dataflow"]
});
```

### 6.4 Overlay updates

The engine should allow overlays to be changed without reparsing the source.

```js
result.setOverlays(["auth", "boundary"]);
result.toggleOverlay("dataflow");
```

### 6.5 PNG export

Rendered diagrams may be exported as PNG from the current render result.

```js
await result.downloadPng("archmap.png");
const blob = await result.exportPng({ scale: 2, background: "#ffffff" });
```

### 6.6 Base view updates

Changing base view may recompute layout, but should not reparse source.

```js
result.setBaseView("3d");
```

---

## 7. Built-in UI controls

The renderer may show built-in UI controls.

### 7.1 Controls option

```html
<archmap-viewer controls="true"></archmap-viewer>
```

```js
render(model, {
  target: el,
  controls: true
});
```

### 7.2 Default controls

When `controls=true`, the viewer should provide:

- base view selector
  - Overview
- Layer
- Prototype
- render mode selector
  - 2D
  - 3D
- overlay checkboxes
  - Subgraph
  - Zone
  - Auth
  - Data Flow
  - Boundary
  - Permission
  - Validation
- fit-to-screen button
- PNG export button
- full-screen button
- abstraction lock button
- diagnostics indicator

The same tag-style controls are available as a reusable browser API:

```js
import { createDiagramTags } from "@archmap/core/controls/diagram-tags";

const tags = createDiagramTags({
  target: document.querySelector("#diagram-tags"),
  state: { baseView: "overview", renderMode: "2d", overlays: [] },
  onChange: (state, event) => {
    // Call RenderResult.setBaseView / setRenderMode / setOverlays here.
  },
  onAction: (action) => {
    // Handle fit, lock, download, or fullscreen.
  }
});
```

For CDN pages the subpath resolves to:

```text
https://cdn.jsdelivr.net/npm/@archmap/core@<version>/dist/controls/diagram-tags.js
```

Example UI:

```text
Base View:
[Overview] [Zone] [3D]

Overlays:
☑ Auth
☑ Data Flow
☐ Boundary
☐ Permission
☐ Validation

[Fit] [Reset] [Warnings: 3]
```

### 7.3 Controls as code

The DSL should not require UI controls to be written inside the architecture model.

UI state belongs to the renderer.

Optional initial UI state may be declared in metadata:

```yaml
view:
  default:
    base: overview
    overlays: [auth, dataflow]
```

User interaction should override the initial state.

---

## 8. Viewport interaction

ArchMap diagrams should support interactive navigation.

### 8.1 SVG views

SVG-based views should support:

- mouse wheel zoom
- trackpad pinch zoom where available
- drag to pan
- double click or button to fit
- reset view
- optional minimap in future versions

Default behavior:

```text
wheel / pinch: zoom in/out
drag background: pan
click node: select node
click edge: select edge
```

### 8.2 3D view

3D view should support:

- mouse drag to rotate camera
- right drag or modifier drag to pan
- mouse wheel to zoom
- touch gestures where possible
- reset camera
- fit to scene
- visible orientation gizmo

3D navigation should feel similar to common orbit controls.

---

## 9. 3D runtime requirements

3D is a required base view and a required product capability.

### 9.1 Loading

The engine may lazy-load the 3D renderer.

When a user selects `3d`:

1. If the 3D renderer is already loaded, mount it.
2. If it is lazy-loadable, load it and then mount it.
3. If loading fails, emit `view_3d_unavailable`, show a user-visible fallback, and keep the current model available.

### 9.2 Fallback state

A 3D fallback state should show:

- clear message that 3D could not be loaded
- diagnostics code `view_3d_unavailable`
- option to return to overview or zone view

The engine must not silently hide the 3D control in a complete distribution.

### 9.3 3D layout input

3D placement should use the canonical model fields:

- `node.resolvedZone`
- `node.layer`
- `node.kind`
- `node.placement`
- zone hierarchy
- graph edges

Manual coordinates are optional hints only.

---

## 10. Diagnostics and warnings

The engine should expose diagnostics in three ways.

### 10.1 Model diagnostics

`parse()` should return or attach diagnostics to the model.

```js
const model = parse(source);

console.log(model.diagnostics);
console.log(model.errors);
console.log(model.warnings);
console.log(model.suggestions);
console.log(model.infos);
```

### 10.2 Console output

By default, the engine should write warnings and errors to the browser console.

```text
[ArchMap warning] auth_token_without_issuer: Edge "Web_API" carries a token but declares no issuer.
```

Console output should be configurable.

```js
initialize({
  diagnostics: {
    console: "warn-and-error"
  }
});
```

Allowed console modes:

```text
false
true
warn-and-error
all
```

`true` is equivalent to `warn-and-error`.

### 10.3 Diagnostic UI

The viewer should render diagnostics into a warning area when enabled.

```html
<archmap-viewer diagnostics="true"></archmap-viewer>
```

The diagnostic UI may show:

- error count
- warning count
- suggestion count
- info count
- diagnostic list
- code
- ref
- message
- click-to-highlight related model element

Example:

```text
Warnings 3 / Suggestions 5
▲ auth_token_without_issuer: Edge "Web_API" carries a token but declares no issuer.
▲ zone_crossing_without_boundary: Edge "Web_APIGW" crosses zones (client → gcp).
```

### 10.4 External diagnostic target

The renderer should allow diagnostics to be written to a separate element.

```html
<archmap-viewer diagnostics-target="#warnings"></archmap-viewer>
<div id="warnings"></div>
```

```js
render(model, {
  target: diagramEl,
  diagnosticsTarget: warningEl
});
```

---

## 11. Inspector

When a user selects a model element, the viewer should show or make available an inspector.

### 11.1 Node inspector

A node inspector should show:

- id
- label
- zone
- resolved zone
- layer
- kind
- provider
- principal
- placement
- tags
- description
- related permissions
- related data objects
- related diagnostics

### 11.2 Edge inspector

An edge inspector should show:

- id
- from
- to
- label
- graph label
- flow
- protocol
- auth
- principal
- data
- networkPath
- boundaryCrossing
- inferred fields
- diagnostics

This is especially important for auth, dataflow, boundary, and permission overlays.

---

## 12. Events

The viewer should emit events for UI integration.

Recommended events:

```text
archmap:ready
archmap:render
archmap:error
archmap:warning
archmap:select-node
archmap:select-edge
archmap:select-zone
archmap:select-boundary
archmap:select-diagnostic
archmap:view-change
archmap:overlay-change
archmap:destroy
```

Example:

```js
viewer.addEventListener("archmap:select-edge", event => {
  console.log(event.detail.edge);
});
```

Event details should include stable model references, not raw DOM-only information.

---

## 13. JavaScript API

### 13.1 Stable v0.1 API

```js
import {
  initialize,
  parse,
  render,
  registerView,
  registerOverlay,
  registerIcon,
  resolveIcon,
  version,
} from "@archmap/core";
```

### 13.2 initialize

```js
initialize({
  selector: "archmap-viewer, .archmap",
  controls: true,
  diagnostics: {
    console: "warn-and-error",
    panel: true
  }
});
```

### 13.3 parse

```js
const model = parse(source);
```

`parse()` returns the canonical model with diagnostics.

### 13.4 render

```js
const result = render(model, {
  target: el,
  baseView: "overview",
  overlays: ["auth", "dataflow"],
  controls: true,
  diagnosticsTarget: "#warnings"
});
```

### 13.5 Render result

```ts
type RenderResult = {
  setBaseView(view: string): void;
  setOverlays(overlays: string[]): void;
  toggleOverlay(overlay: string): void;
  fit(): void;
  reset(): void;
  exportPng(options?: { scale?: number; background?: string }): Promise<Blob>;
  downloadPng(filename?: string, options?: { scale?: number; background?: string }): Promise<void>;
  exportSvg(): string;
  downloadSvg(filename?: string): Promise<void>;
  destroy(): void;
};
```

`exportSvg()` / `downloadSvg()` are available only for SVG-backed 2D views such
as `overview` and `layer`. Mounted views such as `prototype` and optional `3d`
must reject SVG export.

### 13.6 Extension API

```js
registerView("custom", renderer);
registerOverlay("custom-overlay", overlayRenderer);
registerIcon("gcp:cloud-run", iconDefinition);
```

### 13.7 Experimental or internal API

The following APIs may exist but should not be considered stable unless explicitly promoted:

```js
computeLayout
getView
listViews
getIcon
listIcons
clearIcons
resolveNodeIcons
extractArchMapBlocks
```

---

## 14. Custom element API

### 14.1 Attributes

```html
<archmap-viewer
  src="./architecture.archmap"
  base-view="overview"
  overlays="auth,dataflow"
  controls="true"
  diagnostics="true"
  diagnostics-target="#warnings"
  width="100%"
  height="640px"
></archmap-viewer>
```

Supported attributes:

| Attribute | Meaning |
| --- | --- |
| `src` | External ArchMap source file. |
| `base-view` | `overview`, `zone`, or `3d`. |
| `overlays` | Comma-separated overlay list. |
| `controls` | Show built-in controls. |
| `diagnostics` | Show diagnostics panel. |
| `diagnostics-target` | Selector for external diagnostics output. |
| `width` | Viewer width. |
| `height` | Viewer height. |

### 14.2 Attribute defaults

Recommended defaults:

| Attribute | Default |
| --- | --- |
| `base-view` | metadata `view.default.base`, otherwise `overview` |
| `overlays` | metadata `view.default.overlays`, otherwise empty list |
| `controls` | `true` for custom element, configurable globally |
| `diagnostics` | `false` unless controls or validation overlay is active |
| `width` | `100%` |
| `height` | `600px` |

### 14.3 Source priority

If both `src` and inline content are provided, `src` takes priority by default.

If `src` fails to load:

- emit `src_fetch_failed`
- show diagnostics
- use inline content as fallback only if `fallback-to-inline` or equivalent configuration is enabled

### 14.4 Attribute changes

Changing these attributes should update the viewer without reparsing unless the source changes:

- `base-view`
- `overlays`
- `controls`
- `diagnostics`
- `width`
- `height`

Changing `src` or inline source requires reading, parsing, validating, and rendering again.

---

## 15. Rendering lifecycle

The renderer lifecycle is:

```text
discover
  ↓
read source
  ↓
parse
  ↓
validate
  ↓
compute canonical model
  ↓
compute layout
  ↓
mount base view
  ↓
apply overlays
  ↓
attach controls
  ↓
attach interaction
  ↓
emit ready
```

Changing base view or overlays should not require reparsing unless the source changes.

---

## 16. Layout engine expectations

The layout engine must support automatic layout.

Manual layout hints are optional and must not be required for presentable output.

### 16.1 SVG layout expectations

SVG views should:

- respect graph direction
- route edges cleanly
- group zones clearly
- keep labels legible
- support pan and zoom
- preserve mental map during overlay toggles

### 16.2 3D layout expectations

3D layout should:

- derive position from semantic fields
- show layers as height or stacked levels
- show zones as spatial grouping
- show nested zones as nested or grouped volumes
- avoid unreadable edge tangles where possible
- support camera interactions

---

## 17. Performance expectations

The engine should be usable for documentation-sized diagrams.

Recommended target for initial versions:

```text
small: 10-50 nodes
medium: 50-200 nodes
large: 200-500 nodes
```

Expected behavior:

- small diagrams render immediately
- medium diagrams remain interactive
- large diagrams may require simplified rendering or clustering
- 3D rendering may have lower practical limits but should degrade gracefully

---

## 18. Accessibility

The viewer should support:

- keyboard focus for controls
- readable labels
- reduced-motion option
- high contrast theme option
- textual diagnostics
- accessible fallback source block
- keyboard-accessible inspector where possible

---

## 19. Security

The renderer must treat ArchMap source as untrusted text.

Requirements:

- do not execute code from the DSL
- escape labels and descriptions
- sanitize generated HTML/SVG
- avoid unsafe inline event handlers
- avoid loading external resources unless explicitly configured
- apply protocol allowlists for URL-like fields if added
- default external `src` fetch behavior should respect browser security and deployment constraints

If Markdown or HTML labels are supported in the future, they must be sanitized by a documented sanitizer policy.

---

## 20. Prototype View API

`prototype` is a built-in base view for ScreenFlow models. It is mounted through
the existing view registry and render lifecycle:

```ts
const result = render(model, {
  baseView: "prototype",
  overlays: ["dataflow", "boundary", "validation"],
  scenario: "happy_path",
  showHotspots: true,
  target: element,
});
```

The view consumes the same parsed model as overview/layer views. Overlay
changes must not require reparsing.

### 20.1 Custom element attributes

`<archmap-viewer>` supports these Prototype-specific attributes:

- `scenario`: initial scenario id.
- `show-hotspots`: when present or `"true"`, hotspot rectangles are visible.

Example:

```html
<archmap-viewer
  base-view="prototype"
  overlays="dataflow,boundary,validation"
  scenario="happy_path"
  show-hotspots="true"
  controls
></archmap-viewer>
```

### 20.2 RenderResult optional methods

Prototype-capable render handles may expose these optional methods:

```ts
setScenario?(id: string): void;
getScenario?(): string | null;
goToScreen?(id: string): void;
getCurrentScreen?(): string | null;
next?(): void;
back?(): void;
toggleHotspots?(enabled?: boolean): void;
```

Callers must treat them as optional so existing SVG/3D views remain compatible.

### 20.3 Events

Prototype View emits:

- `archmap:prototype-screen-change`
- `archmap:prototype-transition`
- `archmap:prototype-scenario-change`
- `archmap:prototype-hotspot-click`

Event `detail` contains model references, not DOM nodes:

```json
{
  "from": "Home",
  "to": "ProductDetail",
  "edgeId": "Home__ProductDetail__0",
  "scenario": "happy_path"
}
```

---

## 21. Minimal acceptance criteria

The rendering engine is acceptable when:

1. A page can load ArchMap from a CDN.
2. A page can render an inline `<archmap-viewer>` element.
3. A page can enhance `archmap` code blocks.
4. The viewer supports `overview`, `zone`, and `3d` base views.
5. The 3D view is treated as required and has a defined fallback diagnostic.
6. The viewer supports `auth`, `dataflow`, `boundary`, `permission`, and `validation` overlays.
7. The viewer supports mouse wheel zoom and drag pan in SVG views.
8. The 3D view supports drag rotate, pan, wheel zoom, reset, fit, and gizmo display.
9. The viewer can fit to parent width.
10. The viewer can use explicit width and height.
11. Diagnostics are available on the model as `diagnostics`, `errors`, `warnings`, `suggestions`, and `infos`.
12. Warnings and errors can be shown in the console.
13. Diagnostics can be shown in a diagnostics panel or external target.
14. View and overlay changes can be controlled by UI and JavaScript API.
15. Overlay changes do not require reparsing.
16. The renderer works without a backend server.
17. Labels and edges are rendered with enough quality to avoid user confusion.
18. `prototype` base view can display a ScreenFlow current screen and transition controls.
19. Prototype scenario, hotspot visibility, and navigation methods are available through optional APIs without breaking other views.
