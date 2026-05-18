import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@tanstack/react-router",
      "@modular-react/compositions",
      "@modular-react/core",
    ],
  },
  server: { port: 5196 },
});
