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
        "vue",
        "vue-router",
        "@nuxt/kit",
        "@nuxt/schema",
        "@modular-frontend/core",
        "@modular-vue/vue",
        "@modular-vue/core",
        "@modular-vue/runtime",
      ],
    },
    sourcemap: true,
  },
  oxc: {
    exclude: [/\.js$/, /\.d\.[cm]?ts$/],
  },
}));
