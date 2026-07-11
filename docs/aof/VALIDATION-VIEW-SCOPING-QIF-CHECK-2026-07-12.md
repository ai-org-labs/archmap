# Validation View Scoping QIF Check - 2026-07-12

## Trigger

Human observed that a Prototype-specific diagnostic such as
`screen_node_without_image` appeared while not using Prototype mode, and asked
whether validation should be reviewed more broadly.

## Quality Intent

Validation should help the current review task. Diagnostics that describe
Prototype playback authoring should not clutter Overview or Layer architecture
review, while global safety and model integrity findings should remain visible.

## Findings

- `screen_node_without_image`, `transition_without_trigger`,
  `unreachable_screen`, `ambiguous_transition`, `hotspot_out_of_bounds`,
  `scenario_unknown_start`, and `scenario_unknown_step` are Prototype View
  authoring diagnostics.
- These diagnostics should remain on the canonical model so tools and Prototype
  mode can inspect them.
- Overview, Layer, and 3D validation overlays should suppress Prototype-only
  diagnostics.
- External boundary and image URL safety diagnostics remain global. For example,
  `external_transition_without_boundary` and `image_url_disallowed` continue to
  show outside Prototype mode.

## Implementation

- Added a shared diagnostic display context in `src/diagnostics.ts`.
- Reused that context from:
  - SVG validation overlay projection
  - diagnostics panel rendering
  - optional 3D overlay projection
- Added regression coverage proving that Prototype-only diagnostics stay in
  `model.diagnostics` but do not render in Overview/Layer validation output.

## Verification

- `npm test -- --run test/render.test.ts` - 57 passing
- `npx tsc --noEmit`
- `npm test` - 236 passing
- `npm run build`
- Browser smoke on `http://127.0.0.1:5173/`, sample `Checkout release slice`:
  Overview + validation no longer contains `screen_node_without_image` or the
  fallback-card Prototype message.

## Handoff

Next validation review candidates:

- Decide whether console diagnostics should also be view-scoped or remain a
  full model authoring report.
- Document the distinction between model diagnostics and view-scoped diagnostic
  display in `docs/specs/v0.1/02-model-validation.md` / `03-views-rendering.md`
  when preparing the next docs pass.
