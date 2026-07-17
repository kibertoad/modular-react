import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

// Smoke test for the Vue Router customer-onboarding-journey example. Boots the
// shell on Vite's dev server and drives the journey end-to-end: start it into a
// workspace tab, advance a step, reload to prove localStorage persistence
// resumes at the same step, run it to a terminal, and confirm the tab closes.
//
// Any page error or console.error surfaced while rendering fails the test, so
// it catches duplicate-module bugs (the "journeys bundled twice" regression
// that `getInternals()` throws on), hydration errors, and other crashes.
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

test("home page renders the customer list without runtime errors", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /customer onboarding/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start — Alice Martin/i })).toBeVisible();

  assertNoErrors(errors);
});

test("starting a journey mounts the outlet on the profile step", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByRole("button", { name: /Start — Alice Martin/i }).click();

  // The journey tab opens and the profile step (first module) renders.
  await expect(page.getByRole("heading", { name: /Profile · Alice Martin/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Onboard · Alice Martin/ })).toBeVisible();
  await page.waitForTimeout(250); // let microtask-queued errors flush

  assertNoErrors(errors);
});

test("advancing a step, then reloading, resumes on the same step", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByRole("button", { name: /Start — Alice Martin/i }).click();
  await expect(page.getByRole("heading", { name: /Profile · /i })).toBeVisible();

  // Advance profile → plan.
  await page.getByRole("button", { name: /^Pick a plan$/ }).click();
  await expect(page.getByRole("heading", { name: /Choose a plan/i })).toBeVisible();

  // Reload. Persistence should restore the tab AND resume at plan/choose, not
  // re-mount at profile/review.
  await page.reload();
  await expect(page.getByRole("heading", { name: /Choose a plan/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Profile · /i })).not.toBeVisible();

  assertNoErrors(errors);
});

test("driving the journey to a paid terminal closes the tab and returns home", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByRole("button", { name: /Start — Alice Martin/i }).click();
  await expect(page.getByRole("heading", { name: /Profile · /i })).toBeVisible();

  await page.getByRole("button", { name: /^Pick a plan$/ }).click();
  await expect(page.getByRole("heading", { name: /Choose a plan/i })).toBeVisible();

  // Choose the paid path → billing/collect (a lazy-loaded step).
  await page.getByRole("button", { name: /Charge \$\d+ now · activate/ }).click();
  await expect(page.getByRole("heading", { name: /Collect payment/i })).toBeVisible();

  // Process payment → the journey completes; onFinished closes the tab.
  await page.getByRole("button", { name: /^Process payment$/ }).click();

  await expect(page.getByRole("button", { name: /^Onboard · Alice Martin/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /customer onboarding/i })).toBeVisible();

  assertNoErrors(errors);
});

test("closing a journey tab returns the shell to home", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByRole("button", { name: /Start — Alice Martin/i }).click();
  const tabButton = page.getByRole("button", { name: /^Onboard · Alice Martin/ });
  await expect(tabButton).toBeVisible();

  await page.getByRole("button", { name: /^Close Onboard · Alice Martin/ }).click();

  await expect(tabButton).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /customer onboarding/i })).toBeVisible();

  assertNoErrors(errors);
});

test("rehydration drops tabs whose journey is no longer registered", async ({ page }) => {
  const errors = attachErrorCollectors(page);

  // Seed localStorage with a tab pointing at a journey the shell does not
  // register. Boot must drop it quietly and still mount the home page.
  await page.addInitScript(() => {
    localStorage.setItem(
      "workspace-tabs",
      JSON.stringify({
        tabs: [
          {
            tabId: "journey:ghost-journey:999",
            kind: "journey",
            title: "Ghost",
            journeyId: "ghost-journey",
            instanceId: "ji_ghost",
            input: { customerId: "X" },
          },
        ],
        activeTabId: "journey:ghost-journey:999",
      }),
    );
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: /customer onboarding/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Ghost/ })).toHaveCount(0);

  assertNoErrors(errors);
});
