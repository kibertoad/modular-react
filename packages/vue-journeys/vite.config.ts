import { defineConfig } from "vite";
import { dts } from "rolldown-plugin-dts";

export default defineConfig(({ command }) => ({
  plugins: command === "build" ? [dts()] : [],
  build: {
    lib: {
      entry: {
        index: "src/index.ts",
        testing: "src/testing.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        "vue",
        "@modular-frontend/core",
        "@modular-frontend/journeys-engine",
        "@modular-frontend/journeys-engine/testing",
        "@modular-vue/vue",
      ],
    },
    sourcemap: true,
  },
  oxc: {
    exclude: [/\.js$/, /\.d\.[cm]?ts$/],
  },
}));
