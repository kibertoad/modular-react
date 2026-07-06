import { defineConfig } from "vite";
import { dts } from "rolldown-plugin-dts";

export default defineConfig(({ command }) => ({
  plugins: command === "build" ? [dts()] : [],
  build: {
    lib: {
      entry: { index: "src/index.ts" },
      formats: ["es"],
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
        "@modular-frontend/testing",
        "@modular-react/core",
        "@modular-react/journeys",
        "@modular-react/journeys/testing",
        "@modular-react/react",
      ],
    },
    sourcemap: true,
  },
  oxc: {
    exclude: [/\.js$/, /\.d\.[cm]?ts$/],
  },
}));
