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
    // Run the shell on Vite's dev server — the same path the duplicate-module
    // regression surfaced through (Markus reported it via
    // `pnpm --filter customer-onboarding-shell dev`). The dev dep-optimizer
    // pre-bundles the runtime, and if journeys ever leaks into that pre-bundle
    // the shell and runtime end up with duplicate module copies.
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
