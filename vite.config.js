import { defineConfig } from "vite";
export default defineConfig({
  server: { port: 5188 },
  optimizeDeps: { exclude: ["glicol", "@grame/faustwasm"] },
});
