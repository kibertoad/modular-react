import { defineConfig } from "vite";
import { dts } from "rolldown-plugin-dts";

export default defineConfig(({ command }) => ({
  plugins: command === "build" ? [dts()] : [],
  build: {
    lib: {
      entry: { index: "src/index.ts" },
      formats: ["es"],
    },
    sourcemap: true,
  },
  oxc: {
    exclude: [/\.js$/, /\.d\.[cm]?ts$/],
  },
}));
