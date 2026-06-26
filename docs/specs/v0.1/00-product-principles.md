# ArchMap Product Principles

Status: Draft v0.1  
Scope: Product intent, authoring philosophy, Mermaid relationship, required 3D value, rendering quality principles

This document is the highest-level ArchMap specification. Other specifications must not contradict this document.

ArchMap is a browser-first architecture visualization framework. It lets authors describe system architecture using a familiar Mermaid-like graph notation plus semantic metadata, then renders the same model through multiple base views and overlays.

---

## 1. Product purpose

ArchMap exists to make system architecture easier to write, review, explain, and inspect.

The core product promise is:

> Write a readable Mermaid-like diagram, enrich it with architecture metadata, and render it as a clear, beautiful, interactive, multi-layer architecture map.

ArchMap is intended for:

- architecture review
- security review
- dataflow review
- cloud and hybrid infrastructure explanation
- documentation sites
- engineering onboarding
- system ownership and responsibility review
- visually rich communication with non-authors

ArchMap should remain useful even when the metadata is incomplete. A graph-only document should still render. Semantic views become richer as metadata is added.

---

## 2. Why Mermaid-like authoring

ArchMap deliberately starts from Mermaid-style graph authoring because many users already understand Mermaid.js syntax and mental models.

ArchMap should preserve these Mermaid-like strengths:

- text-first authoring
- readable diffs
- low-friction documentation use
- easy copy/paste into Markdown or HTML
- familiar node and edge notation
- familiar graph direction notation such as `graph LR` and `graph TD`
- simple edge labels such as `A -->|HTTPS| B`
- simple grouping through `subgraph`

ArchMap should not require users to learn a completely new diagram language before they can draw their first architecture.

### 2.1 Mental-model compatibility, not full Mermaid compatibility

ArchMap is Mermaid-inspired, not a full Mermaid.js clone.

ArchMap should prioritize:

- a stable architecture DSL
- predictable parsing
- semantic metadata
- high-quality rendering
- layered and zone-aware visualization

ArchMap may accept only a practical subset of Mermaid-like syntax in v0.1. Unsupported Mermaid syntax should produce clear diagnostics rather than surprising output.

---

## 3. Why ArchMap is not just Mermaid.js

Mermaid.js is very useful for simple diagrams, but ArchMap exists because architecture diagrams often need capabilities that plain Mermaid diagrams do not provide well enough.

ArchMap addresses the following gaps:

### 3.1 Rendering quality gap

Architecture diagrams often become hard to read when systems grow.

Common pain points include:

- many crossing edges
- overlapping lines
- labels colliding with nodes or other labels
- hard-to-follow relationships
- weak support for progressive disclosure
- poor readability in dense diagrams
- limited interaction for review and inspection

ArchMap renderers must treat visual clarity as a product requirement, not a nice-to-have.

### 3.2 Semantic metadata gap

Architecture diagrams often need more than nodes and edges.

ArchMap adds structured metadata for:

- layers
- zones
- placement
- boundaries
- authentication
- permissions
- identities
- data objects
- classifications
- diagnostics

This metadata enables semantic overlays without forcing the base diagram to become unreadable.

### 3.3 Hierarchical architecture gap

Real systems are hierarchical.

Examples:

- cloud provider → organization/folder/account/project → region → network → subnet → cluster
- zone → nested zone → service
- trust boundary → network boundary → policy boundary
- team/ownership area → service group → component

ArchMap introduces zones and boundaries to model hierarchy and review surfaces explicitly.

---

## 4. Core concept

An ArchMap source contains:

1. a Mermaid-like graph section
2. an optional YAML metadata section

The graph section defines the visible structure.  
The metadata section enriches the graph with architecture semantics.

Example:

```archmap
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

edges:
  Web->API:
    flow: request
    protocol: HTTPS
    auth: { token: JWT, issuer: FirebaseAuth, validatedBy: API }
    boundaryCrossing: true
```

The parser turns this source into one canonical semantic model. Base views and overlays are projections of that same model.

---

## 5. Base views and overlays

ArchMap separates base views from overlays.

Base views decide the primary layout or spatial organization.

```text
overview | zone | 3d
```

Overlays add semantic information on top of a base view.

```text
auth | dataflow | boundary | permission | validation
```

Examples:

```text
overview + auth
zone + boundary
3d + dataflow
3d + auth + boundary
```

Overlays are not separate models. They are toggled projections of the same normalized architecture model.

---

## 6. 3D is required

3D is a required ArchMap base view.

It is not an optional gimmick and should not be described as a backlog-only feature. It is part of the product identity because ArchMap aims to show architecture as a multi-dimensional structure rather than a flat drawing only.

### 6.1 User value of 3D

The 3D view should provide concrete user benefits:

- reveal cross-zone and cross-layer relationships that are hidden or visually compressed in 2D
- make nested zones easier to understand as spatial containers
- make layer relationships visible through height or stacking
- help reviewers inspect multi-cloud, hybrid, Shared VPC, GKE Fleet, and multi-region structures
- make boundary and dataflow reviews more intuitive when a 2D view is crowded
- provide a memorable spatial mental model for complex systems
- allow users to rotate, zoom, and inspect architecture from different angles

### 6.2 3D implementation requirement

Manual node positions are not required for 3D.

3D placement must be derivable from:

- zone
- nested zones
- layer
- kind
- placement
- graph structure
- edge relationships

Recommended mapping:

```text
X axis: zone / zone hierarchy
Y axis: layer height
Z axis: ordering inside the same zone and layer
```

### 6.3 Bundle delivery

The product must provide 3D as a required capability.

An implementation may lazy-load the 3D renderer or ship it as a separate bundle for performance reasons. That delivery choice must not change the product contract: `3d` is a built-in base view name and must be available in a complete ArchMap distribution.

If a runtime cannot load the 3D renderer, it must show a clear diagnostic such as `view_3d_unavailable` and provide a graceful fallback instead of silently removing the feature.

---

## 7. Rendering quality principles

ArchMap diagrams must be beautiful, readable, and hard to misinterpret.

Rendering quality is a first-class requirement.

### 7.1 Readability before density

The renderer should prefer clarity over squeezing everything into the smallest possible space.

When the diagram is dense, the renderer should use:

- spacing
- grouping
- edge routing
- edge bundling
- progressive disclosure
- fade rules
- inspector panels
- label prioritization
- detail-on-demand

### 7.2 Edge clarity

Edges are often the hardest part of architecture diagrams. ArchMap renderers must actively reduce confusion from lines.

Renderers should:

- minimize unnecessary edge crossings
- avoid overlapping edge segments where possible
- separate parallel edges enough to distinguish them
- avoid placing edge labels on top of nodes, other labels, or unrelated edges
- make arrow direction clear
- make selected or semantically active edges visually prominent
- fade unrelated edges when an overlay or selection is active
- support curved, orthogonal, bundled, or routed edges depending on the view
- preserve enough visual stability that users can switch overlays without losing orientation

If an edge must cross another edge, the crossing should be visually understandable and should not imply a false connection.

### 7.3 Semantic emphasis

Active overlays must make the relevant information immediately understandable.

Examples:

- auth overlay emphasizes token issuers, token-carrying edges, and validators
- dataflow overlay emphasizes data objects, storage, and classification
- boundary overlay emphasizes zone and trust boundary crossings
- permission overlay emphasizes principal → action/role → resource relationships
- validation overlay emphasizes diagnostics and related model elements

Unrelated elements may be faded, collapsed, or moved into an inspector when space is limited.

### 7.4 Beautiful default output

A default ArchMap render should look polished without manual positioning.

Authors should not need to tune coordinates to get a presentable diagram.

### 7.5 Stable mental map

Switching overlays should not unexpectedly reorganize the whole diagram.

Base view switching may change layout because the purpose changes. Overlay toggling should preserve the base layout as much as possible.

### 7.6 Inspectability

The diagram must not force every detail onto the canvas at once.

Users should be able to select a node, edge, zone, boundary, data object, permission, or diagnostic and inspect details in a panel or tooltip.

---

## 8. Authoring principles

ArchMap authoring should be:

- easy to start
- text-first
- readable in Markdown
- suitable for code review
- extensible through metadata
- useful with partial metadata
- strict enough to avoid ambiguous models
- forgiving enough to render incomplete diagrams

### 8.1 Core authoring surface

Normal authors should mainly use:

- graph nodes and edges
- `nodes`
- `edges`
- `zones`
- `boundaries`
- `permissions`
- `data`
- `view`

Advanced or optional features must not make the core DSL feel heavy.

### 8.2 Metadata should enrich, not obscure

Metadata exists to add semantic power. It should not make simple diagrams difficult to write.

A user should be able to begin with a graph and gradually add:

1. labels and kinds
2. layers and zones
3. flows and protocols
4. auth and boundary metadata
5. data and permission metadata
6. advanced placement metadata

---

## 9. Non-goals for v0.1

ArchMap v0.1 is not intended to provide:

- full Mermaid.js syntax compatibility
- full IAM policy evaluation
- full OAuth/OIDC protocol modeling
- provider-specific importers for Terraform, Kubernetes, AWS, GCP, or Azure
- GUI round-trip editing
- timeline or 4D modeling
- manually authored coordinate-heavy diagrams

These may become future capabilities, but they should not complicate the v0.1 authoring model.

---

## 10. Specification set

ArchMap v0.1 uses five normative specification documents:

1. `00-product-principles.md` — product intent and design principles
2. `01-dsl-syntax.md` — authoring syntax and metadata fields
3. `02-model-validation.md` — canonical model, normalization, reference resolution, diagnostics
4. `03-views-rendering.md` — base views, overlays, visual semantics, rendering quality
5. `04-engine-api.md` — browser runtime, embedding, JavaScript API, lifecycle, security

The product principles document is the top-level contract. Lower-level specifications must reference it instead of redefining the product intent.

---

## 11. Product acceptance criteria

ArchMap is acceptable when:

1. Users familiar with Mermaid-like diagrams can write a first ArchMap document quickly.
2. A graph-only document renders as a useful overview.
3. Metadata can be added progressively without rewriting the graph.
4. One canonical model drives all base views and overlays.
5. `overview`, `zone`, and `3d` are built-in base views.
6. `3d` is available as a required product capability.
7. Auth, dataflow, boundary, permission, and validation information can be shown as overlays.
8. Rendered diagrams are visually polished by default.
9. Edge routing and label placement avoid user confusion.
10. Dense diagrams remain inspectable through selection, fading, grouping, and panels.
11. Diagnostics help authors improve a model without blocking useful rendering unnecessarily.
12. The renderer works in a browser without a backend server.
