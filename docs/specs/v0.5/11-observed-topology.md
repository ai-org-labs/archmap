# Runtime View: DSL-authored operational topology

Status: Implemented by TASK-108

## 1. Product intent

ArchMap remains a human/AI-authored DSL. Runtime View provides an
observability-map level visual experience without requiring Datadog, OpenTelemetry,
an agent, or a network connection. Authors may declare a runtime snapshot in the
same document as the architecture graph.

The same canonical graph supports three projections:

- **Design**: all architecture nodes and edges.
- **Runtime**: services and dependencies included in the authored `runtime:` snapshot.
- **Diff**: design elements annotated as matched, design-only, or degraded.

Runtime values must state provenance: `measured`, `estimated`, or `declared`.
ArchMap never presents authored values as trusted live telemetry.

## 2. Compatibility and package boundary

`runtime:` is an optional top-level YAML section in `@archmap/core`. Existing
documents parse and render unchanged. Existing graph syntax does not change.

The Core boundary contains:

- runtime snapshot schema and parser
- reference/provenance validation
- canonical projection and large-graph clustering
- built-in `runtime` View
- JSON, CSV, and SVG snapshot export

External importers may be plugins in a future release, but no connector or OTel
dependency is part of TASK-108.

## 3. DSL

```archmap
graph LR
  Web[Web] --> API[Order API]
  API --> DB[(Orders DB)]
---
runtime:
  window:
    from: 2026-07-15T09:00:00+09:00
    to: 2026-07-15T09:15:00+09:00
    observedAt: 2026-07-15T09:15:00+09:00
  services:
    API:
      health: warning
      source: measured
      environment: production
      team: checkout
      region: asia-northeast1
      metrics:
        requests: { value: 17320, unit: req }
        errors: { value: 0.42, unit: "%" }
        latencyP95: { value: 410, unit: ms }
  dependencies:
    web_api:
      from: Web
      to: API
      health: normal
      source: estimated
      protocol: HTTPS
      metrics:
        requests: { value: 4860, unit: req }
  events:
    deploy_checkout:
      type: deployment
      target: API
      at: 2026-07-15T09:03:00+09:00
      label: checkout-api deployed
```

Health vocabulary: `normal`, `warning`, `critical`, `no-data`, `unknown`.

Runtime service IDs default to architecture node IDs. `node:` may explicitly
map a runtime service to an architecture node. Dependency endpoints may refer
to service IDs or architecture node IDs.

## 4. Runtime View

The toolbar exposes Runtime beside Overview, Topology, Layer, and Prototype.
Runtime View includes:

- Design / Runtime / Diff selector
- Requests / Errors / p95 latency / Throughput / Saturation measure selector
- Environment / Team / Region / Zone grouping
- service/kind filtering
- full-canvas pan and wheel zoom
- health rings plus textual status
- metric-driven edge width using a bounded logarithmic scale
- click selection with immediate-neighborhood highlighting
- details inspector with provenance and dimensions
- authored event timeline
- minimap
- JSON, CSV, and SVG exports

No-data is a first-class state. Missing runtime values are not converted to zero.

## 5. Large graph behavior

The canonical projection is DOM-independent. Above the configured threshold,
grouped views aggregate services and dependencies before rendering. Group nodes
retain member IDs and aggregated edges retain their count. A 10,000-element
source model can therefore be filtered/projected without creating 10,000 DOM
nodes.

## 6. Validation

Core diagnostics cover:

- runtime service references an unknown architecture node
- runtime dependency has missing or unknown endpoints
- runtime event target is unknown or timestamp is missing
- metric values are negative or non-finite
- provenance is outside `measured|estimated|declared`

## 7. Acceptance criteria

1. Existing DSL documents remain compatible.
2. `runtime:` parses into the canonical model and survives canonical export.
3. Design, Runtime, and Diff are produced from the same model.
4. Runtime View exposes controls, canvas, inspector, timeline, and minimap.
5. Health and provenance are distinguishable without color alone.
6. Node selection highlights immediate dependencies.
7. Group projection bounds rendered node count for large graphs.
8. JSON, CSV, and SVG exports are deterministic.
9. The default Checkout sample demonstrates the feature.
10. No OTel, Datadog, live connector, credential, or network dependency is required.
