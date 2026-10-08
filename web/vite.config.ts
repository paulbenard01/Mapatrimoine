import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the build works under any GitHub Pages path.
  base: "./",
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
