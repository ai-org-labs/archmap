/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
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
