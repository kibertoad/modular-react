import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

// Smoke + behavioral coverage for `@modular-vue/compositions` mounted inside a
// Vue Router shell. A page/console-error collector wraps every test so runtime
// regressions (duplicate-module copies, hydration mismatch, uncaught render
// errors) surface as failures regardless of which UI assertion is running.
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

test("home page mounts the CompositionOutlet without runtime errors", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await expect(page.getByTestId("composition-root")).toBeVisible();
  await expect(page.getByTestId("editor-main")).toContainText("doc-1");
  // Source zone resolves to `empty` initially → renders nothing inside its
  // container. The container itself is visible.
  await expect(page.getByTestId("zone-source")).toBeVisible();
  await expect(page.getByTestId("contentful-panel")).toHaveCount(0);
  await expect(page.getByTestId("strapi-panel")).toHaveCount(0);

  assertNoErrors(errors);
});

test("selecting Contentful mounts the contentful source panel", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("source-choice-contentful").click();
  await expect(page.getByTestId("contentful-panel")).toBeVisible();
  await expect(page.getByTestId("strapi-panel")).toHaveCount(0);
  await expect(page.getByTestId("inspector-selected")).toContainText("—");
  await expect(page.getByTestId("inspector-source")).toContainText("contentful");

  assertNoErrors(errors);
});

test("swapping to Strapi unmounts Contentful and mounts the Strapi panel", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("source-choice-contentful").click();
  await expect(page.getByTestId("contentful-panel")).toBeVisible();
  await page.getByTestId("source-choice-strapi").click();
  await expect(page.getByTestId("strapi-panel")).toBeVisible();
  await expect(page.getByTestId("contentful-panel")).toHaveCount(0);
  await expect(page.getByTestId("inspector-source")).toContainText("strapi");

  assertNoErrors(errors);
});

test("a contentful source-item click writes through to the inspector zone", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("source-choice-contentful").click();
  await page.getByTestId("contentful-entry-42").click();
  await expect(page.getByTestId("inspector-selected")).toContainText("entry-42");

  // The selection survives swapping the integration: composition state outlives
  // any one panel.
  await page.getByTestId("source-choice-strapi").click();
  await expect(page.getByTestId("strapi-panel")).toBeVisible();
  await expect(page.getByTestId("inspector-selected")).toContainText("entry-42");

  assertNoErrors(errors);
});

test("strapi panel writes its own selection and the inspector follows", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("source-choice-strapi").click();
  await page.getByTestId("strapi-post-7").click();
  await expect(page.getByTestId("inspector-selected")).toContainText("post-7");

  assertNoErrors(errors);
});

test("returning to None empties the source zone but keeps inspector state", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("source-choice-contentful").click();
  await page.getByTestId("contentful-entry-19").click();
  await expect(page.getByTestId("inspector-selected")).toContainText("entry-19");

  await page.getByTestId("source-choice-none").click();
  await expect(page.getByTestId("contentful-panel")).toHaveCount(0);
  await expect(page.getByTestId("strapi-panel")).toHaveCount(0);
  // Inspector still shows the previously-selected item — composition state
  // outlives the source panel's mount.
  await expect(page.getByTestId("inspector-selected")).toContainText("entry-19");

  assertNoErrors(errors);
});
