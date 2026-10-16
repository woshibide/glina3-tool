import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  // three.js alone is about 600 kB minified; one local tool bundle needs no splitting.
  build: { chunkSizeWarningLimit: 1000 },
});
