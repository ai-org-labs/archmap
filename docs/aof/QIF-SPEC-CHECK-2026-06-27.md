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
| Engine API | Custom element, `src`, controls, diagnostics target, pan/zoom lifecycle, and mutable `RenderResult` controls remain mostly future work. | Residual gap |
| Rendering quality | Current layout protects many legibility basics, but full overlay conflict priority, inspector behavior, and dense-diagram controls are not complete. | Residual gap |

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

## Residual Gaps

- `permission` overlay is intentionally minimal: it highlights known principal
  holder nodes and typed resources, but does not yet synthesize permission edges.
- `RenderResult.setOverlays()`, `toggleOverlay()`, `setBaseView()`, `fit()`,
  `reset()`, and `destroy()` are not implemented as the engine API shape.
- The preferred custom element `<archmap-viewer>` and external `src` loading are
  still future engine work, including `src_fetch_failed`.
- Overlay conflict priority is only partially represented through badge
  overwrites; a full inspector and conflict-collapse system remains open.

## Completion And Success

- Completion for this check: report written, low-risk drift fixed, tests added,
  verification commands pass, and `.aof` handoff updated.
- Success for the broader v0.1 effort: remaining engine API and overlay
  interaction gaps are implemented without regressing graph-only rendering or
  legacy public APIs.
