import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5176 },
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-router", "zustand"],
  },
});
