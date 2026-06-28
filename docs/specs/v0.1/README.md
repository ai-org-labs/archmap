# ArchMap v0.1 Specification Set

This folder contains the consolidated ArchMap v0.1 specification set.

There are five normative specification documents:

1. `00-product-principles.md`  
   Product intent, Mermaid-inspired positioning, required 3D value, visual quality principles.

2. `01-dsl-syntax.md`  
   Authoring syntax, graph section, YAML metadata fields, standard vocabularies.

3. `02-model-validation.md`  
   Canonical model, normalization, reference resolution, diagnostic levels, diagnostic code registry.

4. `03-views-rendering.md`  
   Base views, overlays, visual semantics, rendering quality requirements, inspector and UI behavior.

5. `04-engine-api.md`  
   Browser runtime, custom element, JavaScript API, lifecycle, diagnostics, security, delivery modes.

## Authority order

When documents appear to overlap, use this authority order:

1. Product principles
2. Model and validation
3. DSL syntax
4. Views and rendering
5. Engine and API

The goal is to avoid multiple documents redefining the same concept.

## Key decisions captured

- ArchMap is Mermaid-inspired, not full Mermaid.js compatibility.
- Mermaid-like syntax is used because many users already understand it.
- ArchMap adds layers, zones, boundaries, auth, permissions, dataflow, and validation metadata.
- One canonical model powers all base views and overlays.
- `overview`, `zone`, and `3d` are required built-in base views.
- 3D is required because it provides spatial understanding of zone × layer architecture.
- Rendering quality is a first-class requirement.
- Edge overlap, crossing confusion, and unreadable labels must be actively avoided.
- Diagnostics use four levels: `error`, `warning`, `suggestion`, and `info`.
