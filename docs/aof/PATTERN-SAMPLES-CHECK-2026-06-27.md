# Pattern Samples QIF Check - 2026-06-27

## Scope

User-provided ArchMap pattern samples were imported under `test/fixtures/pattern-samples/` and checked as regression fixtures for parse, diagnostics, and 2D render coverage.

## Samples

| Sample | Nodes | Edges | Zones | Boundaries | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| `01-small-web-basic.archmap` | 4 | 3 | 3 | 2 | pass, 1 known warning |
| `02-medium-auth-external-integrations.archmap` | 14 | 15 | 10 | 5 | pass, 3 known warnings |
| `03-large-multiregion-hybrid-ops.archmap` | 27 | 33 | 14 | 11 | pass, 2 known warnings |
| `04-android-single-app-framework-api.archmap` | 18 | 18 | 10 | 4 | pass, 4 known warnings |
| `05-android-inter-app-collaboration.archmap` | 13 | 10 | 9 | 3 | pass, 2 known warnings |
| `06-android-framework-driver-bt-devices.archmap` | 16 | 15 | 18 | 14 | pass |

## QIF

- Quality: all samples parse without errors and render through `overview`, `zone`, and `layer` with additive overlays.
- Intent: samples now act as executable examples for small web, external auth/integrations, hybrid ops, and Android architecture vocabulary.
- Fit: current renderer accepts the Android extension vocabulary used by these fixtures and does not emit unknown-kind/unknown-flow diagnostics.
- Risk: samples 01-05 intentionally include edges marked `boundaryCrossing: false` that still cross primary zones. This is preserved as `zone_crossing_marked_false` warning behavior until boundary semantics are refined.

## Decision

Keep the warnings visible and treat only `zone_crossing_marked_false` as an expected diagnostic for this fixture set. Any parse error, unknown vocabulary diagnostic, or renderer failure against these samples should block the related task closure.

## Exhaustive Verification

- `npm run verify:pattern-samples` runs against built `dist/archmap.js`.
- Coverage: 6 samples x 3 base views x 32 overlay sets = 576 2D renders.
- Hard checks: parse errors, unexpected diagnostics, SVG class/view identity, invalid SVG tokens, orthogonal edge paths, startpoint count parity, and edge path containment in the SVG viewBox.
- Result on 2026-06-27: 576/576 2D renders passed with 0 failures.

## Browser Verification

- `tools/pattern-browser-verify.html` runs in the Vite playground browser context.
- Coverage: 6 samples x 3 base views x 3 render modes (`2d`, `isometric`, `3d`) with all overlays enabled = 54 browser renders.
- Hard checks: 2D SVG presence/shape, no diagonal edge paths, startpoint count parity, no invalid SVG tokens, and real `isometric`/`3d` canvas creation with non-zero dimensions.
- Result on 2026-06-27: 18 SVG renders + 36 canvas renders passed with 0 failures.

## Follow-up

- TASK-009 should use these fixtures for 3D/isometric framing and overlay parity checks.
- TASK-011 should include these fixtures in recurring QIF/spec alignment audits.
