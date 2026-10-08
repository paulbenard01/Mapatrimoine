import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the build works under any GitHub Pages path.
  base: "./",
  // MapLibre's worker is an ES module.
  worker: { format: "es" },
  // MapLibre alone is ~800 kB minified; splitting would not reduce what the map needs.
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
