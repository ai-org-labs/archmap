# ArchMap

Browser-only semantic architecture diagram rendering framework — a Mermaid-like
DSL that compiles to a rich semantic model and multiple architecture views.

- [docs/SYNTAX.md](./docs/SYNTAX.md) — reference for every **currently
  implemented** syntax/feature (start here to author diagrams)
- [SPEC.md](./SPEC.md) — the v0.1 language design

> **Status:** Stage 4 complete — all six required v0.1 SVG views, an opt-in
> vendor-icon registry, and an **opt-in three.js 3D view** that consumes the
> same layout (`z` → height). The core bundle ships none of the optional
> assets (no icons, no three.js). Edges use orthogonal routing with
> distributed ports (per node face) and channels (per gap) plus crossing-jump
> gaps, so parallel runs separate and overlaps read unambiguously. Next:
> crossing minimization, true zone clustering, service-kind icons.

## Install / dev

```bash
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run build     # ESM + UMD bundle into dist/
```

## Usage

```ts
import { parse, render, computeLayout, registerView } from "archmap";

const model = parse(source);            // ArchMapModel (spec §28)
const { svg } = render(model, { view: "overview" });
// computeLayout(model) -> pure geometry (x, y, z) for any renderer
// registerView("my3d", ctx => ...)     // ctx.layout has z for three.js
```

Browser playground: `npm run dev` then open the dev server root (live source,
no build). Or `npm run build` and open `examples/demo.html` directly from disk
(no server — uses the UMD bundle).

### Vendor icons (opt-in)

The core ships **no icon assets** — only the registry mechanism — so it stays
dependency-free and clear of vendor-logo licensing. Register icons (resolved
per node by `provider`/`kind`, most specific first) yourself, or import the
sample pack:

```ts
import { installCloudIcons } from "archmap/packs/cloud-icons"; // sample, dev only
installCloudIcons();
// or your own asset:
registerIcon("aws", { viewBox: "0 0 24 24", body: '<path .../>' });
```

> Licensing note: AWS and Azure logos were removed from the CC0 `simple-icons`
> set for trademark reasons, and Wiz isn't in it at all. The sample pack uses
> real CC0 logos for GCP/Datadog/Firebase and lettered-badge stand-ins for
> AWS/Azure/Wiz — register the official (licensed) SVGs in real use.

### 3D view (opt-in)

The three.js view is opt-in too — `three` is a peer dependency, not in the
core bundle. It reuses the same `LayoutResult`: the ground plane comes from
(x, y) and the semantic layer depth `z` becomes height (a "layered cake").
Zones render as translucent labeled volumes enclosing their members, and a
corner orientation gizmo shows the current view and snaps to top/front/side on
click.

```ts
import { installThreeView } from "archmap/views3d/three-view"; // needs `three`
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
  render.ts           view registry + render() + initialize() (§27)
  parser/
    sections.ts       split graph/metadata, extract markdown blocks (§4, §5)
    graph.ts          graph-section parser: nodes, edges, subgraphs (§6, §26)
    inference.ts      label inference (§22)
    metadata.ts       YAML parse + merge into model (§7–§21)
  views/
    svg.ts            SVG shape/edge helpers, default theme, crossing-jump gaps
    base.ts           shared diagram assembler (boxes, emphasis, badges)
    overview.ts       Overview view (§24.1)
    zone.ts           Zone view — zone-banded layout (§24.2)
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
test/                 45 tests: parse, merge, inference, validation, layout, render, views, icons, scene3d
examples/             sample .archmap + demo.html (static, UMD)
index.html            dev playground (Vite, live source)
```

## Pipeline status (spec §31 acceptance)

| # | Criterion | Stage |
|---|-----------|-------|
| 1–4 | Parse archmap, extract nodes/edges, merge YAML, full internal model | ✅ done |
| 5 | Overview View renders a basic diagram | ✅ done |
| 6 | Zone View groups nodes by zone | ✅ done |
| 7 | Auth View highlights JWT/token paths | ✅ done |
| 8 | Data Flow View highlights declared data movement | ✅ done |
| 9 | Boundary View highlights zone/trust crossings | ✅ done |
| 10 | Validation warnings available + Validation View | ✅ done |
| 11–12 | Runs without a server / from static files | ✅ (UMD bundle) |
| — | 3D / Layer Stack view (three.js, reuses `z`) | ✅ opt-in preview |
```
