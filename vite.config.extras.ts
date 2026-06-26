import { defineConfig } from "vite";

/**
 * Opt-in entries that live outside the core bundle: the three.js 3D view and
 * the sample icon pack. Built as ESM with `three` externalized (peer dep) so
 * the core stays dependency-free and consumers bring their own three.js.
 */
export default defineConfig({
  build: {
    emptyOutDir: false, // keep the core build output produced by vite.config.ts
    lib: {
      entry: {
        "views3d/three-view": "src/views3d/three-view.ts",
        "packs/cloud-icons": "src/packs/cloud-icons.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      // Externalize three (peer) and the core (shared singleton registries),
      // so these entries don't re-bundle either.
      external: [/^three($|\/)/, "archmap"],
    },
  },
});
