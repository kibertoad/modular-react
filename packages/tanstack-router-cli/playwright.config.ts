import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
  retries: 0,
  use: {
    headless: true,
    baseURL: "http://localhost:5188",
  },
});
