# ArchMap Delivery and Security Notes

This document records the current v0.1 delivery posture for `TASK-010`.
It complements the implemented syntax reference in [SYNTAX.md](./SYNTAX.md)
and the authoritative engine spec in [specs/v0.1/04-engine-api.md](./specs/v0.1/04-engine-api.md).

## Delivery Modes

### npm

Install the package and import the core API:

```bash
npm install archmap
```

```ts
import { initialize, parse, render } from "archmap";

initialize();
const model = parse(source);
const result = render(model, {
  baseView: "overview",
  overlays: ["zone", "auth", "validation"],
  target: document.querySelector("#diagram"),
});
```

The package exports:

- `archmap` core parser/model/SVG renderer/custom element API.
- `archmap/views3d/three-view` optional 3D installer; requires the `three` peer dependency.
- `archmap/packs/cloud-icons` small bundled sample icon pack.

The npm package includes `dist`, `docs`, `examples`, `README.md`, and `SPEC.md`
so consumers can inspect examples and the implemented feature surface without
checking out the source repository.

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

### CDN Pattern

For browser-only pages, use an import map. During local verification,
`examples/demo.html` maps `archmap` to `../dist/archmap.js`; a published package
can use an npm CDN URL instead.

```html
<script type="importmap">
{
  "imports": {
    "archmap": "https://cdn.jsdelivr.net/npm/archmap@0.1.0/dist/archmap.js",
    "archmap/views3d/three-view": "https://cdn.jsdelivr.net/npm/archmap@0.1.0/dist/views3d/three-view.js",
    "three": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js",
    "three/": "https://cdn.jsdelivr.net/npm/three@0.185.0/",
    "@archmap/icons": "https://cdn.jsdelivr.net/npm/@archmap/icons@0.1.1/+esm"
  }
}
</script>
<script type="module">
  import { initialize, registerIcon } from "archmap";
  import { installThreeView } from "archmap/views3d/three-view";
  import { installCloudProviderIcons } from "@archmap/icons";

  installCloudProviderIcons(registerIcon);
  installThreeView();
  initialize();
</script>
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
- Optional icon packs are explicit opt-ins through `registerIcon`; the core
  bundle ships no vendor icon assets.

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
