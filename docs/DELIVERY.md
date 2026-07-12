# ArchMap Delivery and Security Notes

This document records the current v0.1 delivery posture for `TASK-010`.
It complements the implemented syntax reference in [SYNTAX.md](./SYNTAX.md)
and the authoritative engine spec in [specs/v0.1/04-engine-api.md](./specs/v0.1/04-engine-api.md).

## Delivery Modes

### npm

Install the package and import the core API:

```bash
npm install @archmap/core
```

```ts
import { initialize, parse, render } from "@archmap/core";

initialize();
const model = parse(source);
const result = render(model, {
  baseView: "overview",
  overlays: ["zone", "auth", "validation"],
  target: document.querySelector("#diagram"),
});
```

The package exports:

- `@archmap/core` core parser/model/SVG renderer/custom element API.
- `@archmap/core/views3d/three-view` optional 3D installer; requires the `three` peer dependency.
- `@archmap/core/packs/cloud-icons` small bundled sample icon pack.

The npm package includes `dist`, `docs`, `examples`, `README.md`, and `SPEC.md`
so consumers can inspect examples and the implemented feature surface without
checking out the source repository.

The package is licensed under Apache-2.0 and includes `LICENSE` plus
`THIRD_PARTY_NOTICES.md`.

### Local Development

Use the root playground during development:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:4174/`. The playground uses source modules directly
through Vite and shows the same editor ergonomics as the static demo: line
numbers, a draggable editor width, and a top Render action.

### Static Demo

Build once, then open the static demo through the dev server or from disk:

```bash
npm run build
```

```text
examples/demo.html
```

The static demo imports the built local ArchMap bundle and uses jsDelivr for
`three` and `@archmap/icons`.

### Prototype View / ScreenFlow

Prototype View is part of `@archmap/core` and uses the existing
`<archmap-viewer>` element:

```html
<archmap-viewer
  src="./examples/screenflow.archmap"
  base-view="prototype"
  overlays="dataflow,boundary,validation"
  scenario="happy_path"
  show-hotspots="true"
  controls
  diagnostics
  style="display:block;min-height:720px"
></archmap-viewer>
```

The same view is available through JavaScript:

```ts
const result = render(model, {
  baseView: "prototype",
  scenario: "happy_path",
  showHotspots: true,
  target: document.querySelector("#diagram"),
});

result.next?.();
result.back?.();
```

The repository includes a ready-to-open transition-map sample:

```text
examples/screenflow-map.html
```

It loads `examples/screenflow.archmap`, starts in the `prototype` Map view, and
shows screen capture SVGs connected by transition arrows. The same HTML can be
made CDN-only by changing its import map to
`https://cdn.jsdelivr.net/npm/@archmap/core@0.2.1/dist/archmap.js`.

### CDN Pattern

For browser-only pages, use an import map. During local verification,
`examples/demo.html` maps `@archmap/core` to `../dist/archmap.js`; a published package
can use an npm CDN URL instead.

```html
<script type="importmap">
{
  "imports": {
    "@archmap/core": "https://cdn.jsdelivr.net/npm/@archmap/core@0.2.1/dist/archmap.js",
    "@archmap/core/controls/diagram-tags": "https://cdn.jsdelivr.net/npm/@archmap/core@0.2.1/dist/controls/diagram-tags.js",
    "@archmap/core/views3d/three-view": "https://cdn.jsdelivr.net/npm/@archmap/core@0.2.1/dist/views3d/three-view.js",
    "three": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js",
    "three/": "https://cdn.jsdelivr.net/npm/three@0.185.0/",
    "@archmap/icons": "https://cdn.jsdelivr.net/npm/@archmap/icons@0.1.2/+esm"
  }
}
</script>
<script type="module">
  import { initialize, registerIcon } from "@archmap/core";
  import { createDiagramTags } from "@archmap/core/controls/diagram-tags";
  import { installThreeView } from "@archmap/core/views3d/three-view";
  import { installCloudProviderIcons } from "@archmap/icons";

  installCloudProviderIcons(registerIcon);
  installThreeView();
  initialize();

  // Optional: build the same tag controls used by the playground/viewer.
  createDiagramTags({
    target: document.querySelector("#diagram-tags"),
    state: { baseView: "overview", renderMode: "2d", overlays: [] },
    onChange: (state) => console.log(state)
  });
</script>
```

### GitHub Pages viewer

This repository includes a GitHub Actions workflow at
`.github/workflows/pages.yml`. On pushes to `main` or manual
`workflow_dispatch`, it:

1. installs dependencies with `npm ci`,
2. runs `npm run build`,
3. assembles `_site` with `dist`, `examples`, `docs`, and public notices,
4. publishes `_site` through GitHub Pages.

The Pages root is a copy of `examples/demo.html` rewritten to load `./dist/*`.
The original demo remains available at `/examples/demo.html`.

Repository setup:

- The `main` branch must be pushed to the GitHub repository.
- The workflow enables GitHub Pages for GitHub Actions deployments on first
  run. If organization policy blocks automatic enablement, set
  Settings → Pages → Source to **GitHub Actions** manually.
- Optional: add a release tag after npm publish so the Pages version and npm
  package version can be traced together.

### npm publish checklist

Before publishing:

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run
npm whoami
npm publish --access public
```

After publishing, verify the package and CDN paths:

```bash
npm view @archmap/core@0.2.1 version license files
```

Then open:

```text
https://cdn.jsdelivr.net/npm/@archmap/core@0.2.1/dist/archmap.js
https://cdn.jsdelivr.net/npm/@archmap/core@0.2.1/dist/controls/diagram-tags.js
https://cdn.jsdelivr.net/npm/@archmap/core@0.2.1/dist/views3d/three-view.js
```

## Security Posture

ArchMap source must be treated as untrusted text.

Implemented safeguards:

- The DSL is parsed as graph/YAML data; it does not execute scripts.
- SVG labels, descriptions, diagnostic text, titles, inspector fields, ids, and
  style attributes are escaped before being interpolated into generated markup.
- Runtime UI controls are created with DOM APIs or fixed internal SVG snippets,
  not user-supplied HTML.
- `render(model, { target })` replaces the target contents with generated
  ArchMap output; callers should pass a dedicated container, not a document body
  that contains unrelated app state.
- External `src` loading uses browser `fetch` and emits `src_fetch_failed` on
  failure. It does not bypass browser CORS or filesystem restrictions.
- Prototype View image URLs are assigned through DOM attributes and are not
  interpolated as HTML. Unsafe protocols such as `javascript:` and `data:` are
  rejected with `image_url_disallowed`; relative, `http:`, `https:`, and `blob:`
  URLs are allowed.
- Optional icon packs are explicit opt-ins through `registerIcon`; the core
  bundle ships no vendor icon assets.
- Third-party logos, product names, and service marks remain the property of
  their respective owners. Enabling external icon packs is an explicit consumer
  choice; see `THIRD_PARTY_NOTICES.md`.

Current constraints and follow-up items:

- User-authored Markdown or HTML labels are not supported. If added later, they
  must go through a documented sanitizer allowlist before rendering.
- URL-like fields are not rendered as clickable links today. If link rendering is
  added, it must enforce protocol allowlists.
- Registered custom icons are trusted extension data. Do not register icon SVG
  bodies from untrusted user input without sanitizing them first.

## Verification Commands

For routine delivery/security edits:

```bash
npm run build
npm pack --dry-run
```

For renderer, routing, overlay, or verifier changes, also run the relevant
targeted tests and, at stage boundaries, the heavier pattern sample verifier:

```bash
npm test -- --run test/render.test.ts test/scene3d.test.ts
npm run verify:pattern-samples
```
