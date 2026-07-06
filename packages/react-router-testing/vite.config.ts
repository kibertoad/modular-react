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
        "react-router",
        "@tanstack/react-query",
        "@testing-library/react",
        "zustand",
        "@react-router-modules/core",
        "@react-router-modules/runtime",
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
