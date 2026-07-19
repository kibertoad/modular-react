import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Dedupe react and the modular packages so the dev server's pre-bundler
    // doesn't produce two module copies of the same package (the duplicate-
    // module class of regression the runtime guards against).
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react-router",
      "@modular-react/core",
      "@modular-react/react",
    ],
  },
  server: { port: 5198 },
});
