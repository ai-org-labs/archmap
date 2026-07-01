# ArchMap

Browser-only semantic architecture diagram rendering framework — a Mermaid-like
DSL that compiles to a rich semantic model and multiple architecture views.

- [docs/SYNTAX.md](./docs/SYNTAX.md) — reference for every **currently
  implemented** syntax/feature (start here to author diagrams)
- [docs/AI_AUTHORING_GUIDE.md](./docs/AI_AUTHORING_GUIDE.md) — concise
  information-gathering checklist and prompt template for AI agents writing
  ArchMap DSL
- [docs/DELIVERY.md](./docs/DELIVERY.md) — npm/local/CDN delivery and security notes
- [docs/V0_1_ACCEPTANCE_MATRIX.md](./docs/V0_1_ACCEPTANCE_MATRIX.md) —
  v0.1 acceptance status and remaining release decisions
- [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) — third-party dependency,
  icon, and trademark notes
- [SPEC.md](./SPEC.md) — the v0.1 language design

> **Status:** v0.1 developer-preview hardening. The current product surface is
> an overview/stack renderer with additive semantic overlays, optional
> abstraction collapse/expand, an opt-in vendor-icon registry, and an opt-in
> three.js 3D view. The core bundle ships none of the optional assets (no vendor
> icons, no three.js). Edges use orthogonal component-safe routing with
> distributed ports and rendered SVG validation for endpoint/overlap risks.
> Next: release acceptance closure, CDN verification, and continued dense
> diagram visual QA.

## Install / dev

```bash
npm install @archmap/core
```

Development:

```bash
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run build     # ESM + UMD bundle into dist/
```

## Usage

```ts
import { parse, render, computeLayout, registerView } from "@archmap/core";

const model = parse(source);            // ArchMapModel (spec §28)
const { svg } = render(model, { view: "overview" });
// computeLayout(model) -> pure geometry (x, y, z) for any renderer
// registerView("my3d", ctx => ...)     // ctx.layout has z for three.js
```

Browser playground: `npm run dev` then open the dev server root (live source,
no build). Or `npm run build` and open `examples/demo.html` directly from disk
(no server — uses the built ESM bundle plus CDN-hosted optional dependencies).
For ScreenFlow, open `examples/screenflow-map.html` to see screen images linked
as a transition map with Map/Play switching.

Published viewer page: `https://ai-org-labs.github.io/archmap/` after the
GitHub Pages workflow has run on `main`.

### Vendor icons (opt-in)

The core ships **no icon assets** — only the registry mechanism — so it stays
dependency-free and clear of vendor-logo licensing. Icons are resolved per node
by `provider`/`kind` (most specific first: `provider/kind` → `provider` →
`kind`).

**Recommended icon source: [`@archmap/icons`](https://github.com/ai-org-labs/archmap-icons).**
It registers AWS/GCP/Azure service-kind icons (keyed `provider/kind`) plus a
famous-services pack through ArchMap's `registerIcon` — a verified drop-in (same
`RegisterIcon`/`RenderableIcon` types; `@archmap/icons` v0.1.1 ships 1,271
cloud icon entries plus 32 famous-service entries):

```ts
import { registerIcon } from "@archmap/core";
import { installAwsIcons, installFamousServiceIcons } from "@archmap/icons";
installAwsIcons(registerIcon);
installFamousServiceIcons(registerIcon);
```

Or register your own / use the bundled minimal sample:

```ts
import { installCloudIcons } from "@archmap/core/packs/cloud-icons"; // tiny sample
installCloudIcons();
registerIcon("aws", { viewBox: "0 0 24 24", body: '<path .../>' });
```

For a browser-only sample, `examples/demo.html` imports the published icon pack
through jsDelivr:

```html
<script type="importmap">
{
  "imports": {
    "@archmap/icons": "https://cdn.jsdelivr.net/npm/@archmap/icons@0.1.1/+esm"
  }
}
</script>
```

The bundled `@archmap/core/packs/cloud-icons` sample remains intentionally tiny; use
`@archmap/icons` when you want broad provider/service icon coverage.
Third-party logos, product names, and service marks remain the property of
their respective owners; enabling external icon packs is an explicit opt-in.

### 3D view (opt-in)

The three.js view is opt-in too — `three` is a peer dependency, not in the
core bundle. It reuses the same `LayoutResult`: the semantic layer depth `z`
becomes height, zones render as translucent labeled volumes enclosing their
members, and a lower-right labeled ViewCube shows orientation and snaps to
front/top/right on click.

```ts
import { installThreeView } from "@archmap/core/views3d/three-view"; // needs `three`
installThreeView();
const { handle } = render(model, { view: "3d", target: el });
// handle.dispose() tears down the canvas + animation loop
```

A view may now return either an SVG string (2D) or a `MountableView` (3D);
`render()` handles both and returns `svg` or `handle` accordingly.

In the browser via the UMD bundle, the global is `ArchMap`:

```html
<script src="dist/archmap.umd.cjs"></script>
<script>
  const model = ArchMap.parse(source);
  const blocks = ArchMap.extractArchMapBlocks(markdown); // ```archmap fences
</script>
```

## Layout

```
src/
  types.ts            internal model + standard vocabulary (§9, §10, §13, §28)
  index.ts            public API surface
  parser-entry.ts     parse(): Text -> Model
  validate.ts         model validation (§23)
  layout.ts           layout engine: Model -> geometry {x, y, z, w, h};
                      zone swimlanes; orthogonal routing w/ ports + channels
  render.ts           view registry + render() + initialize() + custom element (§27)
  parser/
    sections.ts       split graph/metadata, extract markdown blocks (§4, §5)
    graph.ts          graph-section parser: nodes, edges, subgraphs (§6, §26)
    inference.ts      label inference (§22)
    metadata.ts       YAML parse + merge into model (§7–§21)
  views/
    svg.ts            SVG shape/edge helpers, default theme, crossing-jump gaps
    base.ts           shared diagram assembler (boxes, emphasis, badges)
    overview.ts       Overview view (§24.1)
    zone.ts           Legacy zone view compatibility; current UI exposes zone
                      as an additive overlay
    auth.ts           Auth view — token paths (§24.3)
    dataflow.ts       Data Flow view — data movement (§24.5)
    boundary.ts       Boundary view — trust/network crossings (§24.6)
    validation.ts     Validation view — flags diagnostic refs (§31.10)
  views3d/            opt-in 3D (not in core bundle; needs `three`)
    scene.ts          pure LayoutResult -> 3D world coords (testable)
    three-view.ts     WebGL view: boxes by layer-height, edges, translucent
                      zone volumes + labels, corner orientation gizmo
  packs/
    cloud-icons.ts    opt-in sample icon pack (not in core bundle)
  icons.ts            icon registry mechanism (core; ships no assets)
test/                 parser, model, validation, layout, render, icons,
                      interaction, scene3d, and pattern fixture tests
examples/             sample .archmap + demo.html (static, UMD)
index.html            dev playground (Vite, live source)
```

## Pipeline status (spec §31 acceptance)

| # | Criterion | Stage |
|---|-----------|-------|
| 1–4 | Parse archmap, extract nodes/edges, merge YAML, full internal model | ✅ done |
| 5 | Overview View renders a basic diagram | ✅ done |
| 6 | Zone information groups nodes by zone | ✅ via Add info overlay; legacy view compatible |
| 7 | Auth View highlights JWT/token paths | ✅ done |
| 8 | Data Flow View highlights declared data movement | ✅ done |
| 9 | Boundary View highlights zone/trust crossings | ✅ done |
| 10 | Validation warnings available + Validation View | ✅ done |
| 11–12 | Runs without a server / from static files | ✅ (UMD bundle) |
| — | 3D / Stack view (three.js, reuses `z`) | ✅ opt-in preview |
```

## License

ArchMap is licensed under the Apache License, Version 2.0. See
[LICENSE](./LICENSE). Third-party dependency, icon, and trademark notes are in
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
