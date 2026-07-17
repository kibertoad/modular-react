import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

// Smoke test for the Vue Router integration-manager example. It boots the shell
// on Vite's dev server (the same path a duplicate-module regression would
// surface through) and drives the sibling-modules-sharing-a-screen flow:
// navigate between integrations, assert the shared screen re-renders with each
// module's config, and assert the header zone adapts via `useRouteData`.
//
// Any page error or console.error surfaced while rendering fails the test, so
// it catches duplicate-module bugs, injection failures, and other crashes
// without bespoke assertions per failure mode.
function attachErrorCollectors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => {
    pageErrors.push(`${err.message}\n${err.stack ?? ""}`);
  });
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    consoleErrors.push(msg.text());
  });
  return { pageErrors, consoleErrors };
}

function assertNoErrors({
  pageErrors,
  consoleErrors,
}: {
  pageErrors: string[];
  consoleErrors: string[];
}) {
  expect(pageErrors, `Unhandled page errors:\n${pageErrors.join("\n---\n")}`).toEqual([]);
  expect(consoleErrors, `console.error entries:\n${consoleErrors.join("\n---\n")}`).toEqual([]);
}

test("home page renders with the module-contributed sidebar", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /Integration Manager example/i })).toBeVisible();
  // Header shows the welcome state when no integration route is active.
  await expect(page.getByRole("heading", { name: /^Welcome$/ })).toBeVisible();
  // All three modules contributed a sidebar link.
  await expect(page.getByRole("link", { name: /^Contentful$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Strapi$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^GitHub$/ })).toBeVisible();

  assertNoErrors(errors);
});

test("navigating to Contentful renders the shared screen and adapts the header", async ({
  page,
}) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByRole("link", { name: /^Contentful$/ }).click();
  await expect(page).toHaveURL(/\/integrations\/contentful$/);

  // The shared IntegrationManager screen renders with Contentful's config.
  await expect(page.getByRole("heading", { name: /^Contentful$/, level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Available import tags/i })).toBeVisible();

  // Header zone adapts via useRouteData — Contentful declares
  // allowAssigningLanguagesToFolders + showSkipEmptyOptionOnImport.
  await expect(page.getByRole("button", { name: /Assign languages to folders/i })).toBeVisible();
  await expect(page.getByText(/Skip empty on import/i)).toBeVisible();

  assertNoErrors(errors);
});

test("switching to GitHub swaps the config-driven screen and header", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByRole("link", { name: /^GitHub$/ }).click();
  await expect(page).toHaveURL(/\/integrations\/github$/);

  await expect(page.getByRole("heading", { name: /^GitHub$/, level: 1 })).toBeVisible();
  // GitHub declares maxBatchSize=200 and no import tags.
  await expect(page.getByLabel(/Max batch size/i)).toHaveText(/Batch: 200/);
  await expect(page.getByRole("heading", { name: /Available import tags/i })).toHaveCount(0);
  // GitHub does not allow language/folder assignment — that header button is gone.
  await expect(page.getByRole("button", { name: /Assign languages to folders/i })).toHaveCount(0);

  assertNoErrors(errors);
});
