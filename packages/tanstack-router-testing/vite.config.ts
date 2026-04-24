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
        "@tanstack/react-router",
        "@tanstack/react-query",
        "@testing-library/react",
        "zustand",
        "@tanstack-react-modules/core",
        "@tanstack-react-modules/runtime",
        "@modular-react/core",
        "@modular-react/journeys",
        "@modular-react/journeys/testing",
        "@modular-react/react",
      ],
    },
    sourcemap: true,
  },
});
