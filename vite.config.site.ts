import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    outDir: "site-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(rootDir, "index.html"),
        playground: resolve(rootDir, "playground/index.html"),
        examples: resolve(rootDir, "examples/index.html"),
        prototype: resolve(rootDir, "prototype/index.html"),
        lifecycle: resolve(rootDir, "lifecycle/index.html"),
      },
    },
  },
});
