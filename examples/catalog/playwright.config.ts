import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.CATALOG_TEST_PORT ?? 4399);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Playwright runs against the production catalog bundle hosted by the
 * package's own `serve` command — same flow a host repo would use. The
 * `webServer` block builds the catalog once before any test runs and then
 * starts the server; both happen sequentially via `pnpm start` in the
 * project's own scripts.
 *
 * Heads-up: `pnpm build` rebuilds the catalog every time the test suite
 * runs, which is what we want — the tests assert on real harvested data
 * from the example modules/journeys, not a stale snapshot.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? "list" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm build && node ../../packages/catalog/dist/cli/index.js serve dist-catalog --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
