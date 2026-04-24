import { defineConfig } from "@playwright/test";

const PORT = 5198;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  retries: 0,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    headless: true,
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    // Matches the react-router sibling example — run the shell against the
    // built workspace packages served by Vite dev, so vite's dep-optimizer
    // pre-bundles the runtime and we catch duplicate-module regressions
    // (see packages/journeys/src/runtime.ts `getInternals`).
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
