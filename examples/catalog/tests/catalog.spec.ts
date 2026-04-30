import { expect, test, type Page } from "@playwright/test";

/**
 * E2E tests against the demo catalog. The webServer in playwright.config.ts
 * builds the catalog from `examples/tanstack-router/customer-onboarding-journey`
 * and `examples/tanstack-router/journey-invoke`, so these assertions are
 * coupled to the metadata declared on those modules and journeys. If you
 * rename a team / domain / tag in those examples, update the constants
 * below.
 */
const KNOWN = {
  modules: ["age-verify", "billing", "checkout-confirm", "checkout-review", "plan", "profile"],
  journeys: ["checkout", "customer-onboarding", "verify-identity"],
  teams: ["billing-platform", "checkout", "growth", "onboarding-core", "trust-and-safety"],
  domains: ["commerce", "compliance", "finance", "onboarding"],
};

async function gotoModulesList(page: Page) {
  await page.goto("/");
  // `/` redirects to `/modules`
  await page.waitForURL(/\/modules(\?|$)/);
  await expect(page.getByText(/Showing \d+ of 6 modules/)).toBeVisible();
}

test.describe("catalog SPA", () => {
  test("landing page redirects to /modules and renders all modules", async ({ page }) => {
    await gotoModulesList(page);

    for (const id of KNOWN.modules) {
      // Each card has the descriptor id + version in a mono CardDescription.
      await expect(page.getByText(`${id}@1.0.0`).first()).toBeVisible();
    }
  });

  test("journeys tab renders all journeys", async ({ page }) => {
    await page.goto("/journeys");
    await expect(page.getByText(/Showing 3 of 3 journeys/)).toBeVisible();
    for (const id of KNOWN.journeys) {
      await expect(page.getByText(`${id}@1.0.0`).first()).toBeVisible();
    }
  });

  test("filtering by team narrows the list and round-trips through the URL", async ({ page }) => {
    await gotoModulesList(page);

    // The team select is the 1st FacetSelect after the search input. Open
    // and pick "checkout" — both checkout-review and checkout-confirm share
    // that team in the journey-invoke example.
    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "checkout" }).click();

    await expect(page).toHaveURL(/team=checkout/);
    await expect(page.getByText(/Showing 2 of 6 modules/)).toBeVisible();
    await expect(page.getByText("checkout-review@1.0.0")).toBeVisible();
    await expect(page.getByText("checkout-confirm@1.0.0")).toBeVisible();
    await expect(page.getByText("billing@1.0.0")).not.toBeVisible();

    // URL round-trip: a fresh navigation to the same URL must restore the filter.
    await page.goto("/modules?team=checkout");
    await expect(page.getByText(/Showing 2 of 6 modules/)).toBeVisible();
  });

  test("clicking a team chip on a card navigates to the team pivot", async ({ page }) => {
    await gotoModulesList(page);

    // The first card with team `billing-platform` is `billing` (sorted alphabetically).
    await page.getByRole("link", { name: "billing-platform" }).first().click();
    await expect(page).toHaveURL(/\/teams\/billing-platform$/);
    // Pivot heading shows the team name and a count line.
    await expect(page.getByRole("heading", { name: /billing-platform/ })).toBeVisible();
    await expect(page.getByText(/1 module · 0 journeys/)).toBeVisible();
    await expect(page.getByText("billing@1.0.0")).toBeVisible();
  });

  test("custom 'compliance' facet filters via ?c.compliance and is restored on reload", async ({
    page,
  }) => {
    // catalog.config.ts maps tags → compliance values:
    //   tag "payments" → ["pci", "soc2"]   (billing, checkout-confirm)
    //   tag "identity" → ["soc2"]          (age-verify)
    await page.goto("/modules?c.compliance=pci");
    await expect(page.getByText(/Showing 2 of 6 modules/)).toBeVisible();
    await expect(page.getByText("billing@1.0.0")).toBeVisible();
    await expect(page.getByText("checkout-confirm@1.0.0")).toBeVisible();

    await page.goto("/modules?c.compliance=soc2");
    await expect(page.getByText(/Showing 3 of 6 modules/)).toBeVisible();
    await expect(page.getByText("age-verify@1.0.0")).toBeVisible();
  });

  test("module detail page renders and shows the 'Runbook' extension tab", async ({ page }) => {
    await page.goto("/modules/billing");
    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
    await expect(page.getByText("billing@1.0.0").first()).toBeVisible();

    // Extension tab — declared in catalog.config.ts as { id: "runbook", label: "Runbook" }
    await page.getByRole("tab", { name: "Runbook" }).click();
    const runbook = page.getByTestId("runbook-billing");
    await expect(runbook).toBeVisible();
    // The mock pulls per-team operational data from the table in catalog.config.ts.
    await expect(runbook).toContainText("Priya Anand");
    await expect(runbook).toContainText("#billing-oncall");
    await expect(runbook).toContainText("Recent deploys");
  });

  test("clicking the Ctrl+K hint in the header opens the palette", async ({ page }) => {
    await gotoModulesList(page);

    await page.getByRole("button", { name: /Open command palette/i }).click();

    const palette = page.getByPlaceholder(/Search modules, journeys, teams/);
    await expect(palette).toBeVisible();
  });

  test("cmd-K palette opens, filters, and navigates to the selected module", async ({ page }) => {
    await gotoModulesList(page);

    // The CommandPalette wires a global keydown listener directly on
    // `window` (see CommandPalette.tsx — `window.addEventListener("keydown", …)`).
    // Playwright's `keyboard.press` dispatches through whatever element has
    // focus and Chromium swallows Ctrl+K as the omnibox shortcut, so we
    // dispatch a synthetic KeyboardEvent on the window directly. That's the
    // path the production app exercises anyway (any user keystroke reaches
    // window via bubbling).
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    });

    const palette = page.getByPlaceholder(/Search modules, journeys, teams/);
    await expect(palette).toBeVisible();

    await palette.fill("billing");
    // cmdk highlights the first match by default; Enter activates it.
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/modules\/billing$/);
    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  });

  test("journey detail lists modules used", async ({ page }) => {
    await page.goto("/journeys/customer-onboarding");
    await expect(page.getByRole("heading", { name: "Customer onboarding" })).toBeVisible();
    // The customer-onboarding journey uses profile, plan, billing.
    for (const moduleId of ["profile", "plan", "billing"]) {
      await expect(page.getByRole("link", { name: moduleId })).toBeVisible();
    }
  });

  test("404-style state on unknown module id", async ({ page }) => {
    await page.goto("/modules/does-not-exist");
    await expect(page.getByText(/No module with id/)).toBeVisible();
  });

  test("kind badge appears on list cards and detail headers", async ({ page }) => {
    // Modules list — every card carries a "module" badge.
    await gotoModulesList(page);
    expect(await page.getByText("module", { exact: true }).count()).toBe(KNOWN.modules.length);

    // Module detail — heading carries the same badge.
    await page.goto("/modules/billing");
    await expect(page.getByText("module", { exact: true }).first()).toBeVisible();

    // Journey detail — header carries a "journey" badge instead.
    await page.goto("/journeys/customer-onboarding");
    await expect(page.getByText("journey", { exact: true }).first()).toBeVisible();
  });

  test("Clear button resets filters and is disabled when nothing is active", async ({ page }) => {
    await gotoModulesList(page);

    // No filters active yet — Clear is rendered but disabled.
    const clearButton = page.getByRole("button", { name: "Clear filters" });
    await expect(clearButton).toBeVisible();
    await expect(clearButton).toBeDisabled();

    // Apply a team filter, count narrows, Clear becomes enabled.
    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "checkout" }).click();
    await expect(page.getByText(/Showing 2 of 6 modules/)).toBeVisible();
    await expect(clearButton).toBeEnabled();

    // Click Clear — filter drops, full list returns, URL no longer carries `team`.
    await clearButton.click();
    await expect(page.getByText(/Showing 6 of 6 modules/)).toBeVisible();
    await expect(page).not.toHaveURL(/team=/);
    await expect(clearButton).toBeDisabled();
  });

  test("module entry/exit disclosure shows journey usage and AST destinations", async ({
    page,
  }) => {
    await page.goto("/modules/profile");

    // The profile.review entry is reached by `customer-onboarding`. The row is
    // a <details>; expanding it surfaces the journey id link.
    const reviewRow = page
      .locator("details")
      .filter({ has: page.getByText("review", { exact: true }) })
      .first();
    await reviewRow.locator("summary").click();
    await expect(reviewRow.getByRole("link", { name: "customer-onboarding" })).toBeVisible();

    // The profile.profileComplete exit handler returns
    // `next: { module: "plan", entry: "choose" }`. The AST analyzer recovers
    // that as a destination chip; clicking it navigates to /modules/plan.
    const profileCompleteRow = page
      .locator("details")
      .filter({ has: page.getByText("profileComplete", { exact: true }) })
      .first();
    await profileCompleteRow.locator("summary").click();
    await expect(profileCompleteRow.getByText("plan")).toBeVisible();
    // The destination chip's module name is itself a link to the module page.
    await profileCompleteRow.getByRole("link", { name: "plan" }).click();
    await expect(page).toHaveURL(/\/modules\/plan$/);
  });

  test("journey-to-journey cross-links round-trip", async ({ page }) => {
    // verify-identity is invoked by checkout, declared via checkout.invokes.
    // Modules intentionally do not declare which journeys might launch them.
    await page.goto("/journeys/verify-identity");

    // The grid renders each row as a <dt> label + adjacent <dd> value;
    // scope assertions to the dd that follows each label so we don't pick
    // up unrelated links elsewhere on the page.
    const invokedByValue = page
      .locator("dt", { hasText: "Invoked by journeys" })
      .locator("xpath=following-sibling::dd[1]");
    await expect(invokedByValue.getByRole("link", { name: /^checkout$/ })).toBeVisible();

    // Reverse direction: checkout declares the child journey in its details.
    await page.goto("/journeys/checkout");
    const invokesValue = page
      .locator("dt", { hasText: "Invokes journeys" })
      .locator("xpath=following-sibling::dd[1]");
    await invokesValue.getByRole("link", { name: /^verify-identity$/ }).click();
    await expect(page).toHaveURL(/\/journeys\/verify-identity$/);
  });
});
