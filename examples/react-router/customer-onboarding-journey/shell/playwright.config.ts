import { defineConfig } from "@playwright/test";

const PORT = 5199;

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
    // Run the shell exactly the way a developer would after `pnpm build` —
    // against the built workspace packages served by Vite's dev server.
    // That's the scenario Markus reported: vite's dep-optimizer pre-bundles
    // the runtime, and if journeys ever leaks into that pre-bundle the
    // shell and runtime end up with duplicate module copies.
    command: `node node_modules/vite/bin/vite.js --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
