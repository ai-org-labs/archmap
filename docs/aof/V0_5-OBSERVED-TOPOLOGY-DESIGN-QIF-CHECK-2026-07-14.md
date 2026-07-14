# v0.5 Observed Topology Design QIF Check — 2026-07-14

## Need and intent

Create an observability-grade visual experience whose information density and
investigation flow match the strongest runtime maps, while extending ArchMap's
distinct value: authored design, observed reality, lifecycle traceability, and
their differences in one semantic graph.

## Completion evidence

- Specification: `docs/specs/v0.5/11-observed-topology.md`
- Package boundary: `@archmap/observability` plus connector packages
- Defined visual encoding for nodes, edges, clusters, health, metrics, and
  provenance
- Defined Runtime workspace, interactions, investigation pivots, time travel,
  model, reconciliation, performance, security, export, and delivery stages

## QIF judgment

### Value

Pass. The design does not stop at copying a service map. It connects runtime
behavior to design and lifecycle evidence, providing an ArchMap-specific reason
to exist alongside observability vendors.

### Feasibility

Pass with staged delivery. The existing plugin, view, streaming, topology,
inspector, pan/zoom, and export foundations can be reused. Connector work is
deliberately deferred until the visual shell and canonical observation model
are proven with fixtures.

### Risk and loss boundaries

- **Trademark/copyright imitation:** controlled by an explicit prohibition on
  copied branding, proprietary icons, wording, and pixel-identical UI.
- **Dense graph collapse:** controlled by clustering, semantic zoom,
  virtualization, and numeric budgets.
- **Telemetry misrepresentation:** controlled by provenance, confidence,
  no-data, sampled, and partial states.
- **Core bloat:** controlled by `@archmap/observability` and connector package
  isolation.
- **Interaction regression:** controlled by explicit pan/zoom/select/live patch
  performance acceptance.

## Success gate

Design completion is not product success. Success requires Stage O1 browser
evidence showing an immediately legible, high-density runtime map and Stage O2
benchmarks meeting the specified budgets before connector breadth begins.

