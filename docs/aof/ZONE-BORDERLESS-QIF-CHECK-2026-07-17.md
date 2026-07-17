# Zone Borderless QIF Check — 2026-07-17

## Intent

Render `zone` as a lightweight semantic area instead of an outlined container.
Keep outlines for `boundary` and dashed guides for `subgraph` so the three area
types remain visually distinct.

## Checks

- Zone overlays use translucent fill with no normal stroke.
- Zone color styling no longer emits per-zone stroke variables.
- Boundary overlays remain outlined.
- Subgraph overlays remain unfilled dashed guides.
- Selection can still outline a zone for interaction/debug visibility.
- Public syntax and AI authoring guidance describe the zone/subgraph/boundary split.

## Verification

- `npm test -- --run test/render.test.ts`
- `npx tsc --noEmit`
- `npm run build`

## Result

PASS. The rendering contract now treats zones as borderless filled areas while
preserving boundary and subgraph visual semantics.
