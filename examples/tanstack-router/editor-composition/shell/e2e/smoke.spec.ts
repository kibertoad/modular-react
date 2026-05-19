import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

// TanStack-Router mirror of the RR sibling's smoke suite. Same composition
// behavior is exercised — the only difference here is the host router and
// the dev server port; the composition definition and panel modules are
// identical between the two examples.

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
  await expect(page.getByTestId("inspector-selected")).toContainText("entry-19");

  assertNoErrors(errors);
});
