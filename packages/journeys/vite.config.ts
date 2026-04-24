import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts({ rollupTypes: true })],
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
        "react",
        "react/jsx-runtime",
        "react-dom",
        "@modular-react/core",
        "@modular-react/react",
      ],
    },
    sourcemap: true,
  },
});
