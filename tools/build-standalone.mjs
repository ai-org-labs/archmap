import { build } from "vite";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// IIFE, local icons, and inline styles allow opening this file via file://,
// with no server, CDN, import maps, or module fetches.
const root = fileURLToPath(new URL("../", import.meta.url));
const result = await build({
  configFile: false,
  root,
  logLevel: "warn",
  build: {
    write: false,
    minify: true,
    lib: { entry: `${root}site/site.ts`, name: "ArchMapPlayground", formats: ["iife"] },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
const script = outputs.filter((item) => item.type === "chunk").map((item) => item.code).join("\n");
const styles = outputs.filter((item) => item.type === "asset" && item.fileName.endsWith(".css")).map((item) => String(item.source)).join("\n");
if (!script || !styles) throw new Error("Standalone build requires both JavaScript and CSS");
const notices = await readFile(`${root}THIRD_PARTY_NOTICES.md`, "utf8");
const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ArchMap — Offline Playground</title><style>${styles.replaceAll("</style", "<\\/style")}</style></head>
<body data-page="playground" data-standalone="true"><noscript>ArchMap の描画には JavaScript を有効にしてください。</noscript><script>${script.replaceAll("</script", "<\\/script")}</script><!--\n${notices.replaceAll("--", "—")}\n--></body></html>`;
await mkdir(`${root}site-dist`, { recursive: true });
await writeFile(`${root}site-dist/standalone.html`, html);
await writeFile(`${root}site-dist/.nojekyll`, "");
console.log(`Standalone playground: ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB (all assets included)`);
