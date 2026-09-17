import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: { entry: "src/focused/index.ts", name: "ArchMapDiagrams", fileName: "diagrams", formats: ["es", "umd"] },
    rollupOptions: { output: { exports: "named" } },
  },
});
