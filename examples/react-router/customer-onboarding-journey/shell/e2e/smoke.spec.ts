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

test("advancing a journey, then reloading, resumes on the same step", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  // Start the journey — we land on the profile/review step.
  await page.getByRole("button", { name: /Start — Alice Martin/i }).click();
  await expect(page.getByRole("heading", { name: /Profile · /i })).toBeVisible();

  // Advance one step — profileComplete → plan/choose.
  await page.getByRole("button", { name: /^Pick a plan$/ }).click();
  await expect(page.getByRole("heading", { name: /Choose a plan/i })).toBeVisible();

  // Reload. Persistence should restore the tab AND resume at plan/choose,
  // not re-mount at profile/review (regression guard against any path that
  // re-seeds state on boot).
  await page.reload();
  await expect(page.getByRole("heading", { name: /Choose a plan/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Profile · /i })).not.toBeVisible();

  assertNoErrors(errors);
});

test("closing a journey tab returns the shell to home and clears the tab", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByRole("button", { name: /Start — Alice Martin/i }).click();
  const tabButton = page.getByRole("button", { name: /^Onboard · Alice Martin/ });
  await expect(tabButton).toBeVisible();

  await page.getByRole("button", { name: /^Close Onboard · Alice Martin/ }).click();

  // Tab is gone, home heading is back.
  await expect(tabButton).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /customer onboarding/i })).toBeVisible();

  assertNoErrors(errors);
});

test("rehydration drops tabs whose journey is no longer registered", async ({ page }) => {
  const errors = attachErrorCollectors(page);

  // Seed localStorage with a journey tab pointing at a journey the shell
  // does not register. Before the UnknownJourneyError + isRegistered fix,
  // boot threw and no UI rendered. Now the tab is dropped quietly and the
  // shell still mounts the home page.
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

  // Home renders (the unknown tab did not take the shell down)...
  await expect(page.getByRole("heading", { name: /customer onboarding/i })).toBeVisible();
  // ...and no ghost tab is visible in the tab strip.
  await expect(page.getByRole("button", { name: /^Ghost/ })).toHaveCount(0);

  assertNoErrors(errors);
});
