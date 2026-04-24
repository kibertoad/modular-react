import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts({ rollupTypes: true })],
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: [
        "react",
        "react/jsx-runtime",
        "react-dom",
        "react-router",
        "@tanstack/react-query",
        "zustand",
        "@react-router-modules/core",
        "@modular-react/core",
        "@modular-react/react",
        "@modular-react/journeys",
      ],
    },
    sourcemap: true,
  },
});
