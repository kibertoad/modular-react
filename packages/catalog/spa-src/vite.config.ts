import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Emit alongside the package's other dist artifacts so the CLI's
    // dist-spa-copy step finds it without extra path config.
    outDir: path.resolve(__dirname, "..", "dist-spa"),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
  base: "./",
});
