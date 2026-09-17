import { readFile, access, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import assert from "node:assert/strict";

const root = resolve("site-dist");
for (const page of ["index.html", "playground/index.html", "examples/index.html", "syntax/index.html"]) {
  const path = resolve(root, page);
  const html = await readFile(path, "utf8");
  assert.match(html, /lang="ja"/, `${page}: Japanese document language`);
  for (const [, href] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (href.startsWith("#") || href.startsWith("data:")) continue;
    assert(!/^https?:|^\//.test(href), `${page}: build assets must resolve below the Pages project path: ${href}`);
    await access(resolve(dirname(path), href));
  }
}
const offline = await readFile(resolve(root, "standalone.html"), "utf8");
assert.match(offline, /data-standalone="true"/);
assert.match(offline, /<style>[\s\S]+<\/style>/);
assert.match(offline, /<script>[\s\S]+<\/script>/);
assert(!/<script[^>]+src=|<link[^>]+rel="stylesheet"/.test(offline), "Offline file cannot fetch scripts or styles");
// No legacy engines or heavy 3D chunks in the new site's output.
const assets = await readdir(resolve(root, "assets"));
assert(!assets.some((asset) => /three|lifecycle|prototype/i.test(asset)), "Focused site must omit legacy feature bundles");
await access(resolve(root, ".nojekyll"));
console.log("Verified: four Pages routes, relative assets, offline HTML, and focused bundles.");
