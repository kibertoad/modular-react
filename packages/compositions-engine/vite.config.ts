import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts({ rollupTypes: true })],
  build: {
    lib: {
      entry: {
        index: "src/index.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: ["@modular-frontend/core"],
    },
    sourcemap: true,
  },
});
