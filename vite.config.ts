/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  // Let opt-in entries (3D view, icon packs) import the core via "archmap" so
  // they share its module instances (one view/icon registry) in dev and tests.
  resolve: {
    alias: { archmap: fileURLToPath(new URL("./src/index.ts", import.meta.url)) },
  },
  build: {
    lib: {
      entry: "src/index.ts",
      name: "ArchMap",
      fileName: "archmap",
      formats: ["es", "umd"],
    },
    // js-yaml is bundled in so the UMD build works as a standalone
    // <script> include with a global `ArchMap`, per spec §27.
    rollupOptions: {
      output: { exports: "named" },
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
