import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

// Smoke + behavioral coverage for subject-keyed panels (`<PanelsOutlet>` /
// `usePanels` / `usePanelSubject`) mounted in a React Router shell. Mirrors the
// sibling examples' e2e style: a page/console-error collector wraps every test
// so runtime regressions (duplicate-module copies, uncaught render errors)
// surface as failures regardless of the specific UI assertion.

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

/** Ordered `data-panel` ids currently rendered in the inspector rail. */
async function renderedPanels(page: Page): Promise<string[]> {
  return page
    .getByTestId("inspector")
    .locator("[data-panel]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-panel") ?? ""));
}

test("nothing selected renders the empty state and no panels", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await expect(page.getByTestId("inspector-empty")).toBeVisible();
  expect(await renderedPanels(page)).toEqual([]);

  assertNoErrors(errors);
});

test("a frame-level frontend block shows identity + frontend-config, ordered", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("block-block-login").click();

  // `identity` (order 0) then `frontend-config` (order 20). The consumer
  // panel does not match a frontend block.
  expect(await renderedPanels(page)).toEqual(["identity", "frontend-config"]);
  await expect(page.getByTestId("identity-type")).toHaveText("frontend");
  await expect(page.getByTestId("panel-acme:security-report")).toHaveCount(0);
  await expect(page.getByTestId("inspector-empty")).toHaveCount(0);

  assertNoErrors(errors);
});

test("a plain backend block shows only the always-on identity panel", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("block-block-auth").click();

  expect(await renderedPanels(page)).toEqual(["identity"]);
  await expect(page.getByTestId("identity-type")).toHaveText("backend");
  await expect(page.getByTestId("panel-frontend-config")).toHaveCount(0);

  assertNoErrors(errors);
});

test("the consumer panel appears for its own block type, no host edit", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("block-block-vault").click();

  // `identity` (order 0) then the consumer's `acme:security-report` (order 10).
  // `frontend-config` does not match an acme-secure block.
  expect(await renderedPanels(page)).toEqual(["identity", "acme:security-report"]);
  await expect(page.getByTestId("panel-body-acme-security-report")).toContainText("Secrets vault");
  await expect(page.getByTestId("panel-frontend-config")).toHaveCount(0);

  assertNoErrors(errors);
});

test("re-selecting and clearing re-resolves the rail", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("block-block-login").click();
  expect(await renderedPanels(page)).toEqual(["identity", "frontend-config"]);

  // Switch to the acme-secure block: the rail re-resolves to a different set.
  await page.getByTestId("block-block-vault").click();
  expect(await renderedPanels(page)).toEqual(["identity", "acme:security-report"]);

  // Clearing the selection returns to the empty state.
  await page.getByTestId("block-none").click();
  await expect(page.getByTestId("inspector-empty")).toBeVisible();
  expect(await renderedPanels(page)).toEqual([]);

  assertNoErrors(errors);
});
