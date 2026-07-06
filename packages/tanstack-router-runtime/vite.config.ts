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
        "zustand",
        "@tanstack-react-modules/core",
        "@modular-react/core",
        "@modular-react/react",
        "@modular-react/journeys",
      ],
    },
    sourcemap: true,
  },
  oxc: {
    exclude: [/\.js$/, /\.d\.[cm]?ts$/],
  },
}));
