import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Match the customer-onboarding sibling — dedupe react and the
    // composition runtime so the dev server's pre-bundler doesn't
    // produce two module copies of the same package (the duplicate-
    // module class of regression `getInternals` guards against).
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react-router",
      "@modular-react/compositions",
      "@modular-react/core",
    ],
  },
  server: { port: 5197 },
});
