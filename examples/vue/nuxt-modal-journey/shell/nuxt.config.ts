// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // cat-factory's shape: a client-only SPA. The journey binding only needs to
  // be SSR-safe in the trivial (client-only mount) sense here.
  ssr: false,
  devtools: { enabled: false },

  modules: ["@pinia/nuxt"],

  // The workspace example packages resolve to raw `src` (TypeScript + `.vue`),
  // so Nuxt must run them through its build pipeline instead of treating them
  // as pre-built deps. The `@modular-vue/*` packages ship compiled `dist` and
  // need no transpile.
  build: {
    transpile: [/@example-vue-nuxt-modal\//],
  },

  compatibilityDate: "2025-07-15",
});
