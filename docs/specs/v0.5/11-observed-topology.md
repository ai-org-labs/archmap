# Observed Topology and Runtime Explorer

Status: Approved design direction for the post-v0.4 evolution

## 1. Product intent

ArchMap shall combine three graphs without confusing their provenance:

- **Design**: what authors declare in ArchMap DSL.
- **Observed**: what telemetry proves occurred during a selected time window.
- **Diff**: missing, unexpected, degraded, or changed relationships between the
  authored and observed graphs.

The primary UI name is **Runtime**. The primary canvas view is **Observed
Topology**. It adopts the best established observability-map interaction
patterns while retaining ArchMap's own visual language and its unique links to
requirements, risks, tests, evidence, releases, and operations.

## 2. Package boundary

The feature is installed as a plugin, not embedded as domain vocabulary in
Core.

```ts
import { createArchMap } from "@archmap/core";
import observability from "@archmap/observability";
import otel from "@archmap/connector-otel";

const archmap = createArchMap();
archmap.use(observability);
archmap.use(otel);
```

Initial package responsibilities:

| Package | Responsibility |
| --- | --- |
| `@archmap/core` | Generic graph, plugin APIs, query/trace, render foundations |
| `@archmap/observability` | Runtime schema, aggregation, health semantics, Runtime/Observed Topology views |
| `@archmap/connector-otel` | OTLP traces, metrics, logs, and resource attributes |
| `@archmap/connector-datadog` | Explicit user-configured Datadog API import; no bundled credentials |
| `@archmap/connector-prometheus` | Prometheus metric query import |

Connectors emit the same canonical observation records. No connector may write
trusted lifecycle Evidence without an explicit user policy and provenance.

## 3. Visual direction

### 3.1 Canvas

- Quiet neutral canvas, no decorative gradients, orbs, or marketing surfaces.
- Full-canvas pan and zoom with a minimap for graphs larger than the viewport.
- Stable layout while filters, metrics, and time windows change.
- Left-to-right dependency flow by default; topology and geographic/grouped
  layouts remain selectable.
- Nodes use compact silhouettes at overview scale and progressively reveal
  details as zoom increases.
- Zone fills stay translucent and non-intersecting. Subgraphs stay unfilled
  with dashed outlines. Observed clusters are not zones and use a distinct
  cluster hull treatment.

### 3.2 Node encoding

Every visible node can encode, without relying on color alone:

- service/resource icon and name
- kind and environment
- health ring: normal, warning, critical, no-data, unknown
- primary metric value and unit
- trend glyph relative to the comparison window
- provenance: authored, observed, inferred, or unmatched
- monitor/SLO/incident count badges

Node fill identifies semantic kind. Health is expressed by an outer ring,
status icon, and text so semantic color and operational status do not compete.
Inferred nodes use a dashed outline. Unexpected observed nodes use a distinct
diff marker, not an alarm color unless they are also unhealthy.

### 3.3 Edge encoding

Edges represent observed relationships for the selected time window.

- Width maps to the chosen quantitative metric using bounded logarithmic scale.
- Color maps to health only when health mode is active.
- Direction is shown with arrowheads and optional animated flow only for the
  selected/hovered neighborhood.
- Reciprocal traffic uses separated lanes.
- Labels show one selected value; full dimensions appear in the inspector.
- Long overlap, shared endpoints, component intersections, and non-perpendicular
  component incidence remain prohibited by existing renderer rules.
- Low-volume edges can fade, but remain discoverable through filters and the
  inspector.

Supported initial edge measures:

- request rate
- throughput sent/received
- error rate/count
- latency percentile
- TCP retransmits
- connection count
- trace count

### 3.4 Density and progressive disclosure

- Up to 80 visible nodes: individual topology.
- 81-300: automatic clustering by the selected group keys.
- Above 300: cluster-only initial render with explicit drill-down.
- Labels use semantic zoom thresholds; they are never all rendered at once.
- Offscreen and hidden elements are not mounted in the DOM.
- Cluster badges show count, aggregate health, dominant kind, and metric total.

## 4. Runtime workspace

The Runtime workspace contains four coordinated surfaces, not floating cards
over the canvas:

1. **Query bar** at the top: time range, environment, source, filters, group by,
   compare window, and live/pause.
2. **Canvas**: the observed topology.
3. **Inspector** on the right: details for the selected node, edge, or cluster.
4. **Timeline rail** at the bottom: metric sparkline, deployments, incidents,
   monitor transitions, and selected-window brush.

The existing compact ArchMap view controls remain available but Runtime adds a
focused secondary toolbar:

- Graph mode: Design / Observed / Diff
- Measure: Requests / Errors / Latency / Throughput / Connections
- Group by: service / namespace / zone / region / team / custom tags
- Scope: upstream / downstream / both
- Labels: auto / names / values / hidden
- Live toggle and refresh state

## 5. Interaction contract

### 5.1 Hover

Hover is preview-only and immediate:

- emphasize the node and its one-hop neighborhood
- animate direction only on related edges
- show a compact metric preview
- never hide unrelated topology completely

### 5.2 Selection

Click pins selection and opens the inspector. Selection highlights source,
target, and the complete selected path. Clicking blank canvas closes the
inspector unless it contains unsaved filter edits.

Inspector tabs:

- Summary
- Dependencies
- Telemetry
- Design diff
- Lifecycle
- Diagnostics

The Lifecycle tab links observed services and relations to requirements, risks,
tests, evidence, releases, monitors, incidents, and owners when installed.

### 5.3 Investigation pivots

From a selected node or edge the user can:

- set as focus
- show upstream/downstream
- set as path start/end
- compare with design
- inspect traces/logs/metrics through connector-provided deep links
- open the related architecture or lifecycle element
- hide, mute, or add an exact filter

### 5.4 Time travel

- Changing time updates metrics and membership without needlessly recomputing
  stable geometry.
- Live mode applies incremental observation patches.
- Comparison mode shows current vs previous/custom window changes.
- Playback uses sampled snapshots and never blocks direct canvas interaction.

## 6. Canonical observation model

```ts
export interface ObservationWindow {
  id: string;
  from: string;
  to: string;
  comparedWith?: { from: string; to: string };
  live?: boolean;
  sources: ObservationSourceRef[];
}

export interface ObservedEntity {
  id: string;
  kind: "service" | "database" | "queue" | "host" | "container" |
    "pod" | "endpoint" | "external" | "cluster";
  name: string;
  attributes: Record<string, string | number | boolean>;
  metrics: Record<string, MetricValue>;
  health: HealthState;
  designRef?: GraphElementRef;
  provenance: ObservationProvenance;
}

export interface ObservedRelation {
  id: string;
  from: string;
  to: string;
  protocol?: string;
  operation?: string;
  metrics: Record<string, MetricValue>;
  health: HealthState;
  designRef?: GraphElementRef;
  provenance: ObservationProvenance;
}
```

`ObservationProvenance` includes connector, source query, source identifiers,
capture time, aggregation method, inferred flag, and confidence. Raw logs,
spans, and metric samples are not copied into the graph model; they remain in
their source system and are referenced through bounded summaries/deep links.

## 7. Design-observed reconciliation

Matching order:

1. explicit `designRef`
2. configured identity rules
3. exact normalized service/resource attributes
4. alias registry
5. suggested fuzzy match, never auto-accepted below the configured confidence

Diff states:

- `matched`
- `design_only`
- `observed_only`
- `relation_missing`
- `relation_unexpected`
- `attribute_drift`
- `health_degraded`

The UI must separate absence of observation from proof of absence. No-data is a
first-class state and is never rendered as healthy.

## 8. Query and aggregation

```ts
archmap.runtime.setWindow(window);
archmap.runtime.setFilter(expression);
archmap.runtime.setGroupBy(["env", "service"]);
archmap.runtime.setMeasure("latency.p95");
archmap.runtime.setMode("diff");
archmap.runtime.applyPatch(patch);
```

Filters operate on normalized attributes. Connectors may push filtering to the
source, but must report whether results are exact, sampled, or partial.

Aggregation must be deterministic for a fixed input:

- counters: sum/rate as declared
- gauges: last/avg/min/max as declared
- latency: source-provided percentile or mergeable histogram only
- health: worst active state with explicit no-data handling
- cluster membership: stable sorted keys and IDs

## 9. Performance budget

Measured on the project-supported desktop browser baseline:

- first meaningful map, 100 nodes / 300 edges: <= 300 ms after data arrival
- filter or metric switch with unchanged membership: <= 100 ms
- pan/zoom interaction: >= 55 fps at 300 visible nodes
- 1,000 entities: clustered initial view <= 750 ms
- 10,000 entities: query/aggregation supported; visible DOM remains <= 500
  graph objects
- live updates: coalesced to at most one render per animation frame

Layout, metric encoding, and DOM mount timings must be separately instrumented.
Geometry caches key on topology membership and layout options, not metric
values.

## 10. Accessibility and export

- Keyboard navigation across visible nodes, edges, clusters, and inspector.
- Status is encoded with icon/text/pattern as well as color.
- A text dependency table is available as an alternate representation.
- High-contrast and reduced-motion modes are supported.
- SVG/PNG export captures the selected time window, filters, measure, legend,
  provenance summary, and generated-at timestamp.
- JSON export preserves canonical observation and provenance records.

## 11. Security and privacy

- Credentials are application configuration, never DSL fields.
- Connector payloads are untrusted and escaped like DSL input.
- Tags likely to contain secrets or personal identifiers are redacted by
  configurable policies before persistence/export.
- Deep links use protocol and host allowlists.
- Inferred dependencies are visibly marked and never promoted to authored
  design without confirmation.
- Sampling and partial-data limitations remain visible in the UI/export.

## 12. Delivery stages

### Stage O1: Visual runtime shell

- Runtime workspace, query bar, canvas, inspector, timeline rail
- synthetic observation fixture
- health rings, metric edge encoding, selection, minimap

### Stage O2: Observation model and streaming

- canonical observation records and patches
- deterministic aggregation and clustering
- topology-membership layout cache
- 100/1,000/10,000 benchmarks

### Stage O3: Design / Observed / Diff

- identity rules and reconciliation
- diff rendering and no-data semantics
- lifecycle links in inspector

### Stage O4: OpenTelemetry connector

- traces/resources first, then metrics/log correlations
- source provenance, partial/sampled flags, deep links

### Stage O5: Production hardening

- accessibility, export, security policies, large-graph virtualization
- recurring QIF and visual browser acceptance

Datadog-specific import is optional and follows the generic connector contract;
it is not required to prove the Runtime product experience.

## 13. Acceptance criteria

1. Design, Observed, and Diff modes are visually and semantically distinct.
2. Selected metric changes node/edge encoding without topology re-layout.
3. Node/edge selection opens a pinned inspector and highlights its complete
   relevant neighborhood/path.
4. Clustering keeps dense graphs legible and drillable.
5. Observed nodes and relations retain inspectable provenance.
6. No-data, inferred, unexpected, and unhealthy states are not conflated.
7. Existing component-safe orthogonal routing and label collision guarantees
   hold for the Observed Topology.
8. Lifecycle-installed projects can pivot from runtime elements to related
   requirements, risks, tests, evidence, releases, and incidents.
9. Live patches do not block pan, zoom, selection, or inspector controls.
10. Performance budgets in section 9 have reproducible benchmark evidence.
11. SVG/PNG/JSON exports record window, filters, measure, and provenance.
12. The UI uses ArchMap branding and original components; no third-party UI,
    proprietary icon set, or trademark is copied.

