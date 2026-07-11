# Overlay Popup QIF Check - 2026-07-11

## Scope

Check the semantic overlay label popup change for auth, dataflow, boundary,
permission, and validation badges after the user observed that selection worked
but the popup did not appear.

## QIF

- Quality: overlay badges must remain selectable and must open a readable detail
  popup on click. Popup content must present structured details as key/value
  rows and must close on outside click or Escape.
- Intent: replace delayed hover-only details with explicit click disclosure that
  works for warning, boundary, permission, auth, and dataflow labels without
  scattering metadata across the canvas.
- Fit: popups are attached by `render()` to SVG targets independently of
  pan/zoom. The click handler now runs in capture phase and stops competing
  click handlers so inspector selection or abstraction interactions cannot
  consume the event first. SVG group triggers with a zero bounding rectangle use
  their child bounds for popup placement, covering Safari-style SVG `<g>`
  behavior.
- Risk: browser-level visual smoke should still be repeated when the in-app
  browser automation is attachable, because the reported failure was visual and
  Safari-specific.

## Decision

Treat missing popup display after label selection as release-blocking. The code
path is now guarded by interaction tests for capture-phase registration, fallback
anchor bounds, and popup creation from a label click.

## Verification

- `npm test -- test/interaction.test.ts` - 9 passing.
- `npx tsc --noEmit` - pass.
- `npm test` - 233 passing.
- `npm run build` - pass.
- Vite dev server was restarted for manual browser verification at
  `http://127.0.0.1:5173/`.

## Follow-up

- Repeat manual/Safari smoke on the warning label sample and confirm: selected
  label opens a popup near the label, popup rows are readable, outside click
  closes it, and no hover tooltip remains required.
