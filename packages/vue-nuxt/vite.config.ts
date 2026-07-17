import { defineConfig } from "vite";
import { dts } from "rolldown-plugin-dts";

export default defineConfig(({ command }) => ({
  plugins: command === "build" ? [dts()] : [],
  build: {
    lib: {
      // Two entries: the barrel (`.`, includes the Nuxt-module default export
      // that pulls @nuxt/kit) and a runtime-only entry (`./runtime` → the
      // installer) that the injected plugin imports, so the app's runtime
      // bundle never drags in @nuxt/kit.
      entry: { index: "src/index.ts", runtime: "src/install.ts" },
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
