# QIF Check: Auth Edge Badge Deduplication

Date: 2026-07-12

## Trigger

The browser showed an auth `JWT` badge below the `Login` / `Checkout` nodes while
the same auth information was already shown on the connector. The node-level
badge was not clickable and duplicated the semantic edge label.

## Quality Intent

- Auth details should be shown as one cohesive edge annotation when they describe
  a transition or connector.
- Duplicate node badges must not compete with connector labels or create
  non-clickable dead UI.
- Clickable popup behavior should remain available on the canonical auth label.

## Risk

- Duplicate auth badges make the diagram noisier and imply extra semantics that
  are not present in the DSL.
- Non-clickable duplicate labels break the overlay interaction contract.

## Change

- Removed the auth overlay's automatic node badge for `edge.auth.token`.
- Auth token / issuer / validator / recipient details remain on the edge badge.
- Edge auth badges remain clickable popup triggers.
- Added regression coverage that auth overlays keep the edge `JWT` badge while no
  node-level `archmap-auth-badge` is emitted.

## Verification

- `npm test -- --run test/render.test.ts`
- `npx tsc --noEmit`
- `npm test`
- `npm run build`
- Browser smoke on `http://127.0.0.1:5173/`:
  - sample: `release-checkout`
  - auth overlay checked
  - node auth badge count: `0`
  - edge auth badge count: `3`
  - all edge auth badges had `archmap-popup-trigger`.

## Result

Completion: implemented and tested.

Success: duplicated non-clickable node auth labels are gone; auth semantics are
kept on the connector where the popup details live.
