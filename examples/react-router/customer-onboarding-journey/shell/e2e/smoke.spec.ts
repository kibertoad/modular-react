import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

// Regression test for the "duplicate @modular-react/journeys copy" bug reported
// by Markus on #20. If any build path bundles `@modular-react/journeys` into a
// separate module instance from the shell's copy, `JourneyOutlet` throws
// "getInternals() called on a runtime that was not produced by
// createJourneyRuntime()" — because `getInternals` uses a module-private
// WeakMap and the runtime was inserted into a different map instance.
//
// The test fails on any page error or console.error surfaced while rendering
// the home page and mounting a journey outlet, so it catches duplicate-module
// bugs, hydration errors, and other crashes without needing bespoke assertions
// per failure mode.
function attachErrorCollectors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => {
    pageErrors.push(`${err.message}\n${err.stack ?? ""}`);
  });
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // React's dev build yells loudly about DOM hydration warnings in StrictMode;
    // keep only real failures. Extend if the example adds known-noisy logs.
    consoleErrors.push(text);
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

test("home page renders without runtime errors", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /customer onboarding/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start — Alice Martin/i })).toBeVisible();

  assertNoErrors(errors);
});

test("starting a journey mounts JourneyOutlet without errors", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  // Clicking Start opens a journey tab that renders <JourneyOutlet>, which
  // calls getInternals(runtime). That's the exact call path that blows up
  // when journeys is bundled twice.
  await page.getByRole("button", { name: /Start — Alice Martin/i }).click();

  // The journey's first step (profile module) renders its own heading. We
  // don't care which step — just that something journey-rendered appears and
  // nothing crashed while mounting the outlet.
  await expect(page.getByRole("button", { name: /^Onboard · Alice Martin/ })).toBeVisible();
  await page.waitForTimeout(250); // let microtask-queued errors flush

  assertNoErrors(errors);
});
