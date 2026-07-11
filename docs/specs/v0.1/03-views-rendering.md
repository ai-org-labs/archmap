# ArchMap Views and Rendering Specification

Status: Draft v0.1  
Scope: Base views, overlays, rendering semantics, visual quality, interaction behavior

This document defines how ArchMap views and overlays should present the canonical model.

The product principles define why ArchMap must provide beautiful, readable, multi-layer rendering. This document turns those principles into view-level behavior.

---

## 1. Concept

ArchMap separates base views from overlays.

Base views decide the primary layout and spatial organization.

```text
overview | zone | 3d
```

Overlays add semantic information on top of a base view.

```text
auth | dataflow | boundary | permission | validation
```

A renderer may combine them.

```js
render(model, {
  baseView: "overview",
  overlays: ["auth", "dataflow"]
});
```

Examples:

```text
overview + auth
zone + boundary
3d + dataflow
3d + auth + boundary
```

Overlays must not require reparsing the source.

---

## 2. Global rendering quality requirements

ArchMap rendering must be clear, beautiful, and difficult to misinterpret.

### 2.1 Edge routing

Edges must be routed to reduce visual confusion.

Renderers should:

- minimize edge crossings
- avoid overlapping edge segments where possible
- separate parallel edges
- make arrow direction visible
- keep edge labels readable
- avoid placing labels on top of nodes or unrelated edges
- make selected and overlay-relevant edges stand out
- fade unrelated edges when an overlay is active
- preserve visual stability when overlays are toggled

When edges cross, the renderer should make the crossing visually clear and should avoid implying a false connection.

Recommended techniques:

- orthogonal routing
- curved routing
- edge bundling
- lane-based routing
- label collision avoidance
- crossing minimization
- selected-path highlighting
- edge hover emphasis
- detail-on-demand labels

### 2.2 Node and group clarity

Nodes and groups must remain legible.

Renderers should:

- avoid node overlap
- keep labels within or near their nodes
- visually distinguish zones, boundaries, and nodes
- support nested zones without excessive clutter
- use spacing to communicate grouping
- preserve stable relative positions where possible

### 2.3 Overlay readability

When overlays are active, the renderer should not overload the canvas.

Renderers may:

- show compact badges
- collapse multiple badges into a summary
- use an inspector for details
- fade unrelated nodes and edges
- prioritize validation and selected items
- allow users to filter or focus on a selected semantic object

### 2.4 Beautiful default output

A default render should be presentable in documentation without manual layout work.

Manual positions are not required for any built-in base view, including `3d`.

---

## 3. Base views

## 3.1 Overview view

### Purpose

The overview view shows the whole architecture as a normal architecture diagram.

It answers:

```text
What components exist?
How are they connected?
What is the overall structure?
```

### Shows

- all graph nodes
- all graph edges
- node labels
- edge labels
- light zone context when available
- icons when configured
- selected overlay badges when overlays are active

### Behavior

Zones may be shown, but they are not the primary subject.

The main subject is the component graph.

### Recommended use

Use overview when explaining the system at a high level.

---

## 3.2 Zone view

### Purpose

The zone view makes deployment zones, ownership areas, trust areas, and cloud/on-prem/SaaS boundaries the primary subject.

It answers:

```text
Where does each component live?
Which components are in client, GCP, AWS, on-prem, SaaS, identity, or operations zones?
Which edges cross zones?
```

### Shows

- nodes grouped by primary zone
- zone boxes, lanes, or swimlanes
- nested zones when modeled
- cross-zone edges emphasized
- unknown zones grouped into `unknown`
- optional zone depth controls

### Zone examples

```text
client
identity
edge
gcp
aws
azure
onprem
saas
operations
external
```

### Nested zones

Zone view should support zone nesting.

Example:

```text
GCP
  Project A
    asia-northeast1
      GKE Cluster A
  Project B
  Shared VPC Host
    Shared VPC
```

### Recommended use

Use zone view for:

- multi-cloud architecture
- on-prem integration
- SaaS integration
- Shared VPC
- GKE Fleet
- project/account separation
- trust and ownership review

---

## 3.3 3D view

### Required status

3D is a required ArchMap base view.

A complete ArchMap product must expose `3d` as a base view. It may be lazy-loaded or shipped as a separate bundle, but it is still part of the required product capability.

### Purpose

The 3D view renders the same semantic model as a spatial map.

It answers:

```text
How do zones, layers, boundaries, and connections relate spatially?
Which cross-zone or cross-layer connections are hidden in the 2D view?
How does the system look as a layered architecture map?
```

### User value

The 3D view should help users:

- understand zone and layer relationships at the same time
- inspect nested zones as spatial containers
- find cross-zone and cross-layer edges more easily
- review boundary and dataflow overlays in complex architectures
- build a memorable spatial mental model of the system
- communicate complex architecture to stakeholders through a visually rich view

### Shows

- zone volumes, lanes, or spatial containers
- nested zone volumes when supported
- layer height or stacked levels
- nodes placed by zone/layer/kind/placement
- edges as spatial connections
- camera orientation gizmo
- optional overlays

### Placement

Manual node positions are not required.

3D placement should be derived from:

- `zone`
- nested `zones`
- `layer`
- `kind`
- `placement`
- graph edges

Recommended mapping:

```text
X axis: zone / zone hierarchy
Y axis: layer height
Z axis: ordering inside the same zone and layer
```

### Layer height

Recommended layer order:

```text
client
identity
edge
runtime
messaging
data
network
operations
external
```

### Required interaction

The 3D view must support:

- drag to rotate
- ordinary wheel/scroll to move the camera vertically
- trackpad/browser pinch (`ctrl`-wheel) to zoom
- pan support
- reset camera
- fit scene
- visible orientation gizmo

3D navigation should feel similar to common orbit controls.

### Optional interaction

The 3D view may support:

- click gizmo axis to align view
- orthographic/perspective toggle
- layer slice mode
- zone focus mode
- selected path fly-through or focus

---

## 4. Overlays

## 4.1 Auth overlay

### Purpose

The auth overlay shows authentication and token lifecycle.

It answers:

```text
Who authenticates?
Who issues the token?
Which edge carries the token?
Who validates the token?
```

### Shows

- user/client nodes
- identity providers
- auth services
- token issue edges
- token-carrying edges
- token validators
- token type badges such as JWT, access_token, id_token, cookie

### Canvas representation

The canvas should show compact auth badges.

Example:

```text
Web -- HTTPS + JWT --> API
       [JWT]
       issuer: FirebaseAuth
       validator: API
```

Detailed auth information may be shown in an inspector.

### Fade rule

Nodes and edges unrelated to authentication may be faded.

---

## 4.2 Dataflow overlay

### Purpose

The dataflow overlay shows what data moves through the system, where it is stored, and how it is classified.

It answers:

```text
What data exists?
Which edges carry it?
Where is it stored?
Is it personal, confidential, internal, public, or secret?
```

### Shows

- data-carrying edges
- data badges on edges
- storage nodes
- classification badges
- data object list
- storedIn relationships

### Canvas representation

Example:

```text
GCPApp -- customer_profile / personal --> CloudSQL
```

### Side panel

The renderer should show or make available a list of data objects.

Example:

```text
Customer Profile
  classification: personal
  storedIn: CloudSQL, RDS
  flows: web_api, gcp_db, gcp_aws
```

### Fade rule

Nodes and edges unrelated to selected data objects may be faded.

---

## 4.3 Boundary overlay

### Purpose

The boundary overlay shows trust, network, cloud, SaaS, and organizational boundary crossings.

It answers:

```text
Where does traffic cross a trust boundary?
Which edges cross zones?
Which paths leave GCP, AWS, on-prem, SaaS, or client zones?
```

### Shows

- declared boundary boxes
- zone-crossing edges
- edges with `boundaryCrossing`
- network paths when declared
- boundary labels

### Canvas representation

Boundary-crossing edges should be visually emphasized.

Example:

```text
client → gcp
gcp → aws
gcp → saas
saas → gcp
```

### Recommended use

Boundary overlay works especially well with:

```text
zone + boundary
3d + boundary
```

---

## 4.4 Permission overlay

### Purpose

The permission overlay shows principal-to-resource access.

It answers:

```text
Which principal can access which resource?
What action is allowed or denied?
Which role grants the access?
```

### Shows

- service accounts
- roles
- principals
- resources
- permission edges
- allow/deny effect
- role labels
- conditions when available

### Canvas representation

Example:

```text
gcp-app-sa -- connect / roles/cloudsql.client --> CloudSQL
```

### Relationship to auth overlay

Auth and permission are related but different.

```text
Auth:
  token issue and validation

Permission:
  principal action on resource
```

---

## 4.5 Validation overlay

### Purpose

The validation overlay shows model errors, warnings, suggestions, and info diagnostics on the diagram.

It answers:

```text
Where is the model incomplete?
Which node or edge caused a warning?
What should be fixed?
What was inferred automatically?
```

### Shows

- diagnostic badges on nodes and edges
- count by level
- diagnostic list
- selected diagnostic highlight
- diagnostics inspector

### Canvas representation

Example:

```text
▲ Web_API
  auth_token_without_issuer
```

### Recommended use

Use validation overlay during authoring and review.

---

## 5. Overlay combination rules

Overlays may be combined.

Examples:

```text
overview + auth + dataflow
zone + boundary + validation
3d + dataflow + boundary
```

When overlays conflict visually, priority should be:

```text
validation
permission
auth
dataflow
boundary
base view
```

Renderers may collapse low-priority badges into an inspector when space is limited.

Overlay toggling should not require reparsing the source.

---

## 6. Selection and inspector

Selecting a node, edge, zone, boundary, data object, permission, or diagnostic should expose details for active overlays.

### 6.1 Node inspector

A node inspector should include:

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
- stored data
- processed data
- attached identities
- related permissions
- related diagnostics

### 6.2 Edge inspector

An edge inspector should include:

- id
- from
- to
- label
- graph label
- flow
- protocol
- auth
- data
- principal
- networkPath
- boundaryCrossing
- inferred fields
- diagnostics

### 6.3 Zone inspector

A zone inspector should include:

- id
- label
- kind
- provider
- parent
- child zones
- contained nodes
- owner
- trust level
- diagnostics

### 6.4 Boundary inspector

A boundary inspector should include:

- id
- label
- kind
- contained nodes, zones, and boundaries
- related zone
- crossing edges
- diagnostics

---

## 7. Built-in UI requirements

A viewer should expose base view and overlay controls.

```text
Base View:
[Overview] [Zone] [3D]

Overlays:
☑ Auth
☑ Data Flow
☐ Boundary
☐ Permission
☐ Validation
```

Base view switching changes layout.

Overlay toggling adds or removes semantic information without changing the base layout where possible.

### 7.1 Required controls when controls are enabled

When `controls=true`, the viewer should provide:

- base view selector
- overlay checkboxes
- fit-to-screen button
- reset-view button
- diagnostics indicator

### 7.2 Optional controls

Optional controls include:

- minimap
- search
- focused data object selector
- focused principal selector
- zone depth selector
- layer visibility selector
- 3D perspective/orthographic toggle

---

## 8. Accessibility requirements

Renderers should support:

- keyboard focus for controls
- keyboard selection where possible
- readable labels
- reduced-motion option
- high contrast theme option
- textual diagnostics
- accessible fallback source block
- semantic labels for selected nodes and edges

---

## 9. Performance and density behavior

Recommended target sizes for initial versions:

```text
small: 10-50 nodes
medium: 50-200 nodes
large: 200-500 nodes
```

Expected behavior:

- small diagrams should render immediately
- medium diagrams should remain interactive
- large diagrams may require simplified rendering, clustering, or progressive disclosure
- 3D may have lower practical limits but must degrade gracefully

---

## 10. View-specific acceptance criteria

Views are acceptable when:

1. Overview shows the full architecture graph.
2. Zone view groups nodes by zone and emphasizes cross-zone edges.
3. 3D view is available and supports gizmo, drag, pan, zoom, reset, and fit.
4. 3D view communicates zone × layer structure without manual positions.
5. Auth overlay shows issuer, token-carrying edges, and validators.
6. Dataflow overlay shows data objects, classifications, storedIn, and flows.
7. Boundary overlay emphasizes boundary and zone crossings.
8. Permission overlay shows principal-resource-action relationships.
9. Validation overlay highlights diagnostics on the diagram.
10. Overlays can be combined with overview, zone, and 3D.
11. Overlay changes do not require reparsing the source.
12. Lines, labels, and groups are routed and placed to avoid user confusion.
13. Default output is visually polished enough for documentation.
