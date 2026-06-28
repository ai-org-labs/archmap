# ArchMap v0.1 Acceptance Matrix

Status legend:

- **Pass:** implemented and covered by tests or browser verification.
- **Partial:** usable, but spec wording or product polish still needs follow-up.
- **Defer:** intentionally outside the current slice.

This matrix is the `TASK-010` working record for the authoritative specs in
[docs/specs/v0.1](./specs/v0.1/).

## Product Principles

Source: [00-product-principles.md §11](./specs/v0.1/00-product-principles.md#11-product-acceptance-criteria)

| # | Criterion | Status | Evidence / next action |
|---|---|---|---|
| 1 | Mermaid-like users can write a first document quickly. | Pass | Graph section accepts Mermaid-like nodes, edges, labels, comments, and subgraphs. See [SYNTAX.md](./SYNTAX.md). |
| 2 | Graph-only document renders as useful overview. | Pass | `render(parse("graph LR..."), { baseView: "overview" })`; covered by render tests. |
| 3 | Metadata can be added progressively. | Pass | Graph and YAML metadata merge; unknown/partial metadata warns rather than blocking. |
| 4 | One canonical model drives views and overlays. | Pass | Parser normalizes graph/YAML into one model; overlays and 2D/3D consume the same model/layout. |
| 5 | `overview`, `zone`, and `3d` are built-in base views. | Partial | `overview` and `3d` are active base/render modes. Zone is now an Add info overlay by product decision; legacy `baseView: "zone"` compatibility remains but UI presents zone as additive area information. |
| 6 | `3d` is available as required product capability. | Pass | Core has fallback diagnostic; optional `installThreeView()` provides real 3D. |
| 7 | Auth/dataflow/boundary/permission/validation overlays exist. | Pass | All five overlays render grouped badges/summaries in 2D and semantic labels in 3D where practical. |
| 8 | Rendered diagrams are visually polished by default. | Partial | Current routing, zone coloring, icon sizing, and label placement are improved; continue visual QA on dense samples. |
| 9 | Edge routing and label placement avoid confusion. | Partial | Render validation checks endpoint overlap, port gaps, long segment overlap, component intersections, and perpendicular incidence; dense human feedback continues to drive refinements. |
| 10 | Dense diagrams remain inspectable. | Pass | Selection, inspector, diagnostics panel, grouped badges, abstraction collapse/expand, and full screen controls are available. |
| 11 | Diagnostics help without blocking useful rendering. | Pass | Diagnostics are levelled into errors/warnings/suggestions/infos; warnings do not block rendering. |
| 12 | Browser-only renderer, no backend server. | Pass | Vite playground and static demo are browser-only; package builds ESM/UMD artifacts. |

## Views and Rendering

Source: [03-views-rendering.md §10](./specs/v0.1/03-views-rendering.md#10-view-specific-acceptance-criteria)

| # | Criterion | Status | Evidence / next action |
|---|---|---|---|
| 1 | Overview shows full architecture graph. | Pass | Default `overview` renders structural nodes and edges. |
| 2 | Zone view groups nodes by zone and emphasizes crossings. | Partial | Zone is implemented as an Add info area overlay; crossing emphasis is handled through boundary/validation semantics. Keep compatibility note in docs. |
| 3 | 3D has gizmo, drag, pan, zoom, reset, fit. | Pass | ViewCube, OrbitControls, fit/reset, full screen, and no-grid scene are implemented. |
| 4 | 3D communicates zone x layer without manual positions. | Pass | 3D uses zone volumes and layer/stack height from model metadata. |
| 5 | Auth overlay shows issuer, token edges, validators. | Pass | One grouped auth badge per edge with hover details; 3D edge label parity. |
| 6 | Dataflow overlay shows objects, classifications, storedIn, flows. | Pass | Grouped data badges and target badges; hover details carry secondary metadata. |
| 7 | Boundary overlay emphasizes boundary and zone crossings. | Pass | Boundary boxes and edge badges render; nested boundaries supported. |
| 8 | Permission overlay shows principal-resource-action relationships. | Pass | Permission summaries render as grouped badges instead of dense synthetic lines. |
| 9 | Validation overlay highlights diagnostics. | Pass | Level-specific validation badges and classes for error/warning/suggestion/info. |
| 10 | Overlays combine with overview, zone, and 3D. | Partial | Overlays combine with overview/stack and 3D; zone is additive rather than a primary UI base view. |
| 11 | Overlay changes do not reparse source. | Pass | `RenderResult.addOverlay/removeOverlay/setOverlays` updates render state without source reparse and preserves 2D pan/zoom. |
| 12 | Lines, labels, groups avoid confusion. | Partial | Automated render validation plus fixture/browser checks exist; keep QIF visual audits active for dense diagrams. |
| 13 | Default output polished enough for docs. | Partial | Good for current samples; acceptance remains visual and should stay under human review before release. |

## Engine API

Source: [04-engine-api.md §20](./specs/v0.1/04-engine-api.md#20-minimal-acceptance-criteria)

| # | Criterion | Status | Evidence / next action |
|---|---|---|---|
| 1 | Page can load ArchMap from CDN. | Partial | `examples/demo.html` demonstrates a CDN import-map pattern for `three`/`@archmap/icons` and local `dist`; published `archmap` CDN URL should be verified after npm release. |
| 2 | Inline `<archmap-viewer>` renders. | Pass | Custom element parses inline text content and renders. |
| 3 | Enhance `archmap` code blocks. | Pass | `initialize()` scans configured selectors and `extractArchMapBlocks` reads fenced blocks. |
| 4 | Viewer supports `overview`, `zone`, `3d` base views. | Partial | `overview` and `3d` are primary controls; `zone` remains supported for compatibility but product UI treats it as Add info. |
| 5 | 3D fallback diagnostic. | Pass | Core fallback emits `view_3d_unavailable`; installing the 3D bundle replaces it. |
| 6 | Five semantic overlays supported. | Pass | Auth, dataflow, boundary, permission, validation are additive controls. |
| 7 | SVG wheel zoom and drag pan. | Pass | Attached for interactive 2D targets; `fit()`/`reset()` available. |
| 8 | 3D drag/pan/zoom/reset/fit/gizmo. | Pass | Real 3D view satisfies this with OrbitControls and ViewCube. |
| 9 | Fit to parent width. | Pass | `RenderResult.fit()` and viewer controls fit current container. |
| 10 | Explicit width/height. | Pass | `<archmap-viewer width height>` attributes are parsed and applied. |
| 11 | Model diagnostics arrays. | Pass | `diagnostics`, `errors`, `warnings`, `suggestions`, `infos`. |
| 12 | Console warnings/errors. | Pass | Viewer console reporting defaults on; programmatic `render(..., { console })` is opt-in. |
| 13 | Diagnostics panel/external target. | Pass | `diagnostics`, `diagnostics-target`, and `renderDiagnostics()`. |
| 14 | UI and JS controls for view/overlay changes. | Pass | Tag controls and `RenderResult` update methods. |
| 15 | Overlay changes do not reparse. | Pass | Overlay state updates reuse the model/result. |
| 16 | No backend server required. | Pass | Static demo and package output are browser-only. |
| 17 | Labels/edges are readable. | Partial | Render validation and sample checks cover many failure modes; continue visual QA. |

## Security Review

Source: [04-engine-api.md §19](./specs/v0.1/04-engine-api.md#19-security)

| Requirement | Status | Evidence / next action |
|---|---|---|
| Do not execute DSL code. | Pass | Parser treats source as graph/YAML data. |
| Escape labels/descriptions. | Pass | SVG/diagnostics/inspector rendering use `escapeXml`; tests cover special-character labels. |
| Sanitize generated HTML/SVG. | Partial | Generated markup escapes model text and uses fixed internal snippets. Future HTML/Markdown labels require a sanitizer policy before support. |
| Avoid unsafe inline event handlers. | Pass | Generated SVG contains no user-derived inline event handlers; UI controls attach listeners through DOM APIs. |
| Avoid external resources unless configured. | Pass | 3D/icons/external `src` are explicit opt-ins. |
| URL protocol allowlists if URL fields are added. | Defer | URL fields are not rendered as links yet. |
| External `src` respects browser constraints. | Pass | Uses browser `fetch`; failures emit `src_fetch_failed`. |

## Current Release Readiness Summary

ArchMap is close to v0.1 developer-preview readiness. The remaining `TASK-010`
work is mostly:

1. Verify the published CDN path after an npm release candidate exists.
2. Decide how to document the product-level `zone` base-view wording now that
   zone is intentionally an Add info overlay in the UI.
3. Keep dense-rendering QIF checks active before claiming final visual polish.
