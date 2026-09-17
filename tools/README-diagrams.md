# Focused diagram checks

- `npm run typecheck` includes the static site, engine, and test sources.
- `npm test` includes legacy regression coverage and the focused grammar/layout checks.
- `npm run build` emits the legacy library, focused library, declarations, four site routes, and a self-contained offline HTML file.
- `npm run verify:site` verifies generated relative asset paths and the offline bundle.
- `npm run bench:diagrams` measures parser/layout/SVG generation for all five samples and a 40-node grid, checks determinism, and guards against a two-second regression.

For release visual QA, open `npm run preview:site`, inspect each sample at desktop and narrow widths, edit a label, enter an invalid reference, restore the source, reload the local draft, and test SVG / PNG / source export. Open `site-dist/standalone.html` with networking disabled to validate file-based operation. A passing geometry test does not prove every authored graph can be drawn without crossings.
