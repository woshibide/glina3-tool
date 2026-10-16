import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  base: "./",
  // three.js alone is about 600 kB minified; one local tool bundle needs no splitting.
  build: { chunkSizeWarningLimit: 1000 },
});
