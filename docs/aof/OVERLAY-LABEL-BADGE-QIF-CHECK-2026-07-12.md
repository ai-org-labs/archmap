# QIF Check: Overlay Badge / Edge Label Collision

Date: 2026-07-12

## Trigger

The browser screenshot showed an ordinary edge label (`issues JWT`) overlapping
an auth overlay badge (`JWT`). The auth badge background also did not provide
enough horizontal coverage for the icon plus label text.

## Quality Intent

- Overlay information must be additive, not visually destructive.
- Ordinary edge labels and overlay badges must not occupy the same visual space.
- Badge backgrounds must cover the icon, text, and readable right padding.

## Risk

- Auth/dataflow/boundary/permission/validation overlays can become unreadable on
  exactly the diagrams where the user needs semantic detail.
- Under-sized badges make the label appear broken even when the routing itself is
  valid.

## Change

- Normal edge-label boxes are reserved before overlay edge badges are placed.
- Overlay edge badge placement now avoids those reserved label boxes.
- Edge badge width now accounts for the icon column, text width, and right
  padding.
- Added regression coverage for an `issues JWT` edge label with a `JWT` auth
  badge.

## Verification

- `npm test -- --run test/render.test.ts`
- `npx tsc --noEmit`
- `npm test`
- `npm run build`
- Browser smoke on `http://127.0.0.1:5173/`:
  - sample: `release-checkout`
  - normal edge-label / overlay badge overlap count: `0`
  - visible `JWT` auth badges retain about 15px right padding after the text.

## Result

Completion: implemented and tested.

Success: the observed label/badge collision class is prevented for the rendered
view and overlay combination, and badge labels fit inside their backgrounds.
