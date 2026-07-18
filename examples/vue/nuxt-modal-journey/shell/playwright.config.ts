import { defineConfig } from "@playwright/test";

const PORT = 5211;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // Nuxt dev compiles on the first request, so the cold first test needs room.
  timeout: 120_000,
  retries: 0,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    headless: true,
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `pnpm exec nuxi dev --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
