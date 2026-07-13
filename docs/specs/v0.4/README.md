# ArchMap v0.4 specification set

ArchMap v0.4 extends v0.3 from an architecture visualization DSL into a
requirements and lifecycle semantic graph. The v0.1 and v0.2 specifications
remain normative. v0.4 is additive and must parse and render existing v0.3
documents without modification.

Documents:

1. [`08-requirements-lifecycle-graph.md`](08-requirements-lifecycle-graph.md) —
   product vision, lifecycle domain model, typed relations, views, validation,
   integration boundaries, APIs, scale, security, and roadmap to 1.0.
2. [`09-v0.4-mvp-vertical-slice.md`](09-v0.4-mvp-vertical-slice.md) — the
   executable v0.4 MVP contract and login requirement vertical slice.
3. [`10-plugin-architecture.md`](10-plugin-architecture.md) — the core/plugin
   boundary, initial package split, registration API, and installation model.

Authority order for v0.4 work:

1. v0.1 product principles and compatibility contracts
2. v0.4 lifecycle graph requirements
3. v0.4 plugin architecture
4. v0.4 MVP vertical slice
5. v0.2 Timeline and Topology view additions

When a conflict is discovered, preserve v0.3 compatibility and record an
explicit decision before changing public model or DSL behavior.
