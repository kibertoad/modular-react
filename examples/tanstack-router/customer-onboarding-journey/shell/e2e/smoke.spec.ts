import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

// Mirror of the react-router sibling test — guards against the duplicate
// `@modular-react/journeys` copy bug reported on #20. `getInternals` uses a
// module-private WeakMap, so if any build path gives the shell and the
// runtime different module instances, <JourneyOutlet> throws on mount. The
// test fails on any pageerror / console.error, which is the shape that bug
// takes in the browser.
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

  await page.getByRole("button", { name: /Start — Alice Martin/i }).click();

  await expect(page.getByRole("button", { name: /^Onboard · Alice Martin/ })).toBeVisible();
  await page.waitForTimeout(250);

  assertNoErrors(errors);
});

test("advancing a journey, then reloading, resumes on the same step", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByRole("button", { name: /Start — Alice Martin/i }).click();
  await expect(page.getByRole("heading", { name: /Profile · /i })).toBeVisible();

  await page.getByRole("button", { name: /^Pick a plan$/ }).click();
  await expect(page.getByRole("heading", { name: /Choose a plan/i })).toBeVisible();

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

  await expect(tabButton).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /customer onboarding/i })).toBeVisible();

  assertNoErrors(errors);
});

test("rehydration drops tabs whose journey is no longer registered", async ({ page }) => {
  const errors = attachErrorCollectors(page);

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
