# 06 — Timeline (4D) modeling and rendering

Status: normative for ArchMap v0.2.
Depends on: `01-dsl-syntax.md` (metadata sections), `02-model-validation.md`
(canonical model, diagnostics), `03-views-rendering.md` (base views, overlays).

## 1. Purpose

The timeline adds a fourth dimension — time — to the canonical model. One
document describes how an architecture **evolves**: components appear, change
lifecycle state, and disappear across named phases. Primary use cases:
migrations, DR topologies, blue-green and canary rollouts.

The timeline is **not** a flow-playback mechanism. Request sequencing remains
the job of `scenarios:` (spec 05); the two are independent and can coexist.

## 2. The `timeline:` section

```yaml
timeline:
  label: Cloud migration            # optional display label
  phases:                            # id -> definition (mapping form)
    now:      { label: "Today" }
    parallel: { label: "Parallel run", at: "2026-Q3" }
    cutover:  { label: "Cutover", at: "2026-Q4" }
    done:     { label: "Cloud only", at: "2027-Q1" }
  order: [now, parallel, cutover, done]   # optional; defaults to declaration order
  default: now                            # optional; defaults to the first phase
```

- `phases` is a mapping keyed by phase id, consistent with every other keyed
  section. Phase order is **semantic**: it defines the time axis.
- `order:` overrides declaration order. It is recommended whenever phase ids
  are numeric-like (e.g. `"2026"`), because JavaScript object key ordering
  rearranges integer-like keys.
- `at` is a display-only point-in-time annotation. v0.2 performs no date math.
- The canonical model carries `timeline.phases` as an **ordered array** (it is
  not converted to a Record; order would be lost).

## 3. Element lifecycle

`nodes.*`, `edges.*`, and `zones.*` accept an optional `lifecycle:`:

```yaml
nodes:
  app_cloud:
    lifecycle:
      added: parallel                 # exists from `parallel` (inclusive)
      states: { parallel: planned }   # state at `parallel`, sticky forward
  db_onprem:
    lifecycle:
      removed: done                   # absent from `done` (inclusive)
      states: { cutover: deprecated }
edges:
  replication:
    lifecycle: { added: parallel, removed: done }
```

### 3.1 Presence semantics

- Presence is the **half-open interval `[added, removed)`** in phase indices.
  Defaults: `added` = the first phase, `removed` = never.
- Elements without a `lifecycle` exist in every phase (zero-cost default).
- Unknown phase references degrade safely at render time (unknown `added`
  behaves as the first phase, unknown `removed` as never) and are reported by
  validation as errors.

### 3.2 States

- `states` maps phase id → lifecycle state. A state takes effect at its phase
  and **persists until overridden** by a later entry (sticky forward).
- Standard vocabulary (`STANDARD_LIFECYCLE_STATES`):
  `planned | active | deprecated | removing`. The default state is `active`.
  Unknown states warn (`unknown_lifecycle_state`) and render as `active`.

### 3.3 Edge derivation and clamping

- An edge **without** a lifecycle derives its presence from its endpoints:
  `added = max(from.added, to.added)`, `removed = min(from.removed, to.removed)`.
- An edge **with** a lifecycle is intersected (clamped) with the derived
  interval: an edge can never render present while an endpoint is absent.
  A declared interval that exceeds the endpoints warns
  (`lifecycle_edge_endpoint_absent`).

### 3.4 Zones

A zone lifecycle ghosts **the zone box only**; member nodes are not implicitly
removed (explicitness principle). A zone absent at a phase where a contained
node is present warns (`lifecycle_zone_member_present`).

## 4. Diagnostics

| Code | Level |
|---|---|
| `timeline_unknown_order_ref`, `lifecycle_unknown_phase`, `lifecycle_removed_before_added` | error |
| `timeline_empty`, `timeline_order_duplicate`, `timeline_order_incomplete`, `timeline_unknown_default`, `lifecycle_without_timeline`, `lifecycle_edge_endpoint_absent`, `lifecycle_zone_member_present`, `unknown_lifecycle_state` | warning |
| `lifecycle_state_while_absent` | suggestion |

Timeline-section diagnostics target `{ type: "view", id: "timeline" }`;
element diagnostics target the owning node/edge/zone.

## 5. Rendering rules

- **Stable geometry.** Layout is always computed from the full (all-time)
  model. Scrubbing phases never moves a node. Consequence: absent elements
  still occupy layout space (accepted trade-off; a `phaseAbsent: "hidden"`
  render option is reserved but not implemented — it would require the time
  projection to become a model projection and join the render cache key).
- **Absent = ghosted, not hidden.** Absent elements render at strong ghost
  opacity (`.archmap-phase-absent`, ~0.12) with dashed node/edge strokes; zone
  boxes ghost by opacity only (area panels stay solid). The evolution delta
  stays visible.
- **State styling.** `planned` renders dashed/translucent, `deprecated` amber,
  `removing` red-dashed (`.archmap-lifecycle-*` classes, themeable via CSS
  variables).
- The SVG root carries `data-phase="<id>"` and class `archmap-phase-<id>`.
- **`timeline` overlay** (additive checkbox like other overlays): emphasizes
  elements whose presence or state changes at the active phase and badges the
  transitions (`+ <phase>`, `- <phase>`, state names). Ghost/state styling is
  NOT gated on this overlay — it applies whenever a phase is active.
- **3D**: absent nodes render as transparent ghosts and absent edges
  near-invisible. Per-state 3D coloring and incremental (non-remount) phase
  switching are follow-ups.
- **Prototype view** ignores the timeline in v0.2 (screens are a flow, not an
  evolution). Collapsed abstraction (subgraph/zone) synthetic nodes are always
  present; aggregating member lifecycles is a follow-up.

## 6. Engine API (additive)

- `RenderOptions.phase?: string` — phase to display; defaults to
  `timeline.default`, else the first phase. Documents without a timeline
  ignore it entirely.
- `RenderResult.setPhase(id | null)` / `getPhase()` / `listPhases()`.
  `setPhase` preserves pan/zoom and, by contract, must not recompute layout
  (phase switching is decoration-only; the render caches are keyed without
  the phase).
- `<archmap-viewer phase="...">` — attribute changes switch phases; removing
  the attribute restores the timeline default. With `controls`, the toolbar
  shows a phase group (prev / slider / next / label) when the model has phases.
- `createDiagramTags({ timeline: { phases, label? } })` renders the phase
  group; state gains `phase`, change events gain kind `"phase"`.
- Exported helpers: `computePhasePresence`, `buildTimeDecoration`,
  `listTimelinePhases`, `resolvePhaseId` (+ `PhasePresence`, `TimeDecoration`,
  `PresenceInterval` types).

## 7. Reserved 5D extension (`variants:`) — not implemented in v0.2

The fifth dimension is the **variant** (world line): DR topology vs. normal,
A/B architecture candidates, what-if designs. Reserved shape:

```yaml
variants:
  worlds:
    baseline: { label: "As designed" }
    dr:       { label: "DR failover" }
  default: baseline
```

- `variants:` is a sibling of `timeline:`; element lifecycles gain a reserved
  `variants:` sub-key later (`lifecycle.variants.<world>` overrides the
  baseline declaration). Coordinates become the orthogonal pair
  `(variant, phase)`.
- v0.2 parsers MUST ignore `variants:` (top-level) and `lifecycle.variants`
  silently. Do not repurpose these keys.
