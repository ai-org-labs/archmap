# QIF Spec Alignment Check — 2026-06-27

Scope: compare the current implementation against `docs/specs/v0.1/` using QIF
quality intent, risk, and loss framing. Authority order follows
`docs/specs/v0.1/README.md`.

## Quality Intent

- A graph-only document still renders usefully.
- One normalized model drives base views and overlays.
- Diagnostics are trustworthy, four-level, and do not block render unless the
  model cannot be rendered safely.
- The public API should move toward `render(model,{baseView,overlays})` while
  preserving existing `render(model,{view})` callers during migration.
- 3D remains a required product capability; if the optional bundle is not
  installed, the runtime must show a visible fallback and emit
  `view_3d_unavailable`.

## Findings

| Area | QIF judgment | Status |
| --- | --- | --- |
| Parse / normalize | Matches the staged v0.1 direction: source is preserved, graph subgraphs are retained, pair-key edge identity and data relation normalization are covered by tests. | Accept |
| Diagnostics | Matches four-level shape with derived arrays. Remaining registry gaps are lower-risk compared with Stage 3 completion criteria. | Accept |
| View metadata | Spec allows `view.default: { base, overlays }`; implementation only used compact string before this check. | Fixed in `TASK-004` |
| 3D base view | Spec requires `3d` as a base view name and `view_3d_unavailable` fallback when the renderer is absent. Core registry lacked a fallback before this check. | Fixed in `TASK-004` |
| Overlay API | Previous scaffold validated overlay names but did not apply semantic projections. That risked drifting into a class-only API. | Improved in `TASK-004` |
| Engine API | Custom element, `src`, diagnostics target, SVG pan/zoom lifecycle, viewer UI controls, configurable console diagnostics, and inspector target hooks now exist. | Improved through `TASK-007` |
| Rendering quality | Current layout protects legibility basics, overlays combine, dense permission labels collapse to summaries, nested zones/boundaries render, and selected/diagnostic targets can be highlighted on the diagram. | Improved through `TASK-008` |

## Fixes Applied In TASK-004

- `render(model)` now honors spec-shaped metadata:
  `view.default.base` and `view.default.overlays`.
- Core registers a `3d` fallback view that emits `view_3d_unavailable` and
  renders a visible SVG fallback. `installThreeView()` still replaces it with
  the real Three.js view.
- `overview` and `zone` base views can now combine known overlays without
  reparsing. The projection can emphasize relevant nodes/edges, apply compact
  node badges, and add boundary boxes.
- Flat semantic views (`auth`, `dataflow`, `boundary`, `validation`) reuse the
  same overlay projection logic so legacy view behavior and new overlay behavior
  stay aligned.
- Permission resources now accept typed refs such as
  `{ type: "zone", id: "gcp" }`, and permission principals can resolve through
  `nodes.*.principal` as required by the model spec.

## Follow-up Applied In TASK-002

- Permission overlay now synthesizes principal-to-resource annotation edges
  with role/action labels and resource badges.
- `RenderResult` now exposes `setBaseView(view)`, `setOverlays(overlays)`,
  `toggleOverlay(overlay)`, `fit()`, `reset()`, and `destroy()`. The overlay
  and base-view mutators rerender the existing model into the original target
  without reparsing.

## Follow-up Applied In TASK-005

- `<archmap-viewer src>` now loads external ArchMap source before inline content.
- Failed external source loads emit `src_fetch_failed` on the rendered model and
  show diagnostics. Inline fallback is used only when `fallback-to-inline` is
  present.
- `render(model,{diagnosticsTarget})` and `<archmap-viewer diagnostics>` /
  `diagnostics-target` can render a diagnostics summary/list to an internal
  panel or external element.

## Follow-up Applied In TASK-006

- Viewer `controls=true` now provides base-view buttons, overlay checkboxes,
  fit/reset controls, and a diagnostics indicator.
- SVG pan/zoom is attached for interactive 2D DOM targets; `RenderResult.fit()`
  and `reset()` now drive the SVG transform through the interaction handle.

## Follow-up Applied In TASK-007

- Added a spec-shaped inspector helper layer for nodes, edges, zones,
  boundaries, data objects, permissions, identities, and diagnostics.
- `render(model,{inspectorTarget,selection})` and `<archmap-viewer inspector>`
  / `inspector-target` can render selected-element details into an internal or
  external target.
- Viewer SVG clicks on nodes, edges, zones, boundaries, and permission overlay
  edges update the inspector and emit `archmap:select-*` events with stable
  model references.
- Diagnostics panel rows now carry diagnostic index and target data attributes
  so follow-up focus/filter/highlight behavior can bind without parsing text.

## Follow-up Applied In TASK-012

- The provided comprehensive v2 sample now parses cleanly against its QIF
  intent: 0 errors, 0 warnings, 0 suggestions, and 2 expected `inferred_flow`
  infos.
- Standard vocabulary was synchronized for `kubernetes_cluster`,
  `vpc_peering`, `user` / `external_user` identity kinds, and
  `telemetry_export` / `log_export` / `trace_export` flows.
- Flow-sensitive auth validation now follows spec §18: `token_issue` does not
  require `validatedBy`; request-like/token-validate flows still require a
  validator when a token is present.
- `placement_ref_unknown` no longer treats standard placement dimensions such as
  project, account, network, subnet, cluster, and fleet as required modeled
  object references.

## Follow-up Applied In TASK-008

- Dense rendering quality was hardened around route readability: orthogonal
  graph routes avoid node shapes, keep routed edge geometry inside the canvas,
  prefer nearby ports/shorter routes, and preserve non-rectangular shape
  boundaries for endpoints.
- Zone and boundary labels now use scored in-box placement to avoid nodes, edge
  labels, edge segments, and other group labels.
- Nested zones render from existing `zones.parent` / `zones.contains`
  semantics, and boundaries can wrap referenced zones.
- Selection and diagnostics focus now add `archmap-selected` on the diagram, and
  diagnostics-panel clicks can highlight the related model element.

## Residual Gaps

- Responsive re-fit on container resize and 3D fit/reset parity remain open for
  TASK-009 / viewer polish.
- Optional richer isometric/3D controls (angle presets, depth, layer visibility)
  remain open for TASK-009.

## Completion And Success

- Completion for the parse→normalize→diagnostics→overview epic: report written,
  low-risk drift fixed, overlays combine on base views, mutable render controls
  exist, verification commands pass, and `.aof` handoff is updated.
- Success for the broader v0.1 product: remaining engine API and viewer
  interaction gaps are implemented without regressing graph-only rendering or
  legacy public APIs.
