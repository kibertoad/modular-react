import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // Dedupe vue and the modular packages so the dev server's pre-bundler
    // doesn't produce two module copies of the same package. The shared overlay
    // stack lives in a module-private singleton in @modular-frontend/core, so a
    // second copy would split the stack and break Escape ordering across
    // hosted windows and bespoke `useModalBehavior` overlays.
    dedupe: ["vue", "vue-router", "@modular-vue/core", "@modular-vue/vue", "@modular-vue/runtime"],
  },
  server: { port: 5204 },
});
