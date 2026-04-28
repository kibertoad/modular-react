import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

// E2E coverage for the `selectModuleOrDefault` dispatch in the
// integration-setup journey:
//
//   chooser → (github | strapi)              specific dispatch (cases)
//          → (contentful | notion | …other)  fallback to generic module
//
// Each branch has its own assertion on the terminal payload's `kind` so a
// regression that mis-routes a kind (e.g. github → generic) fails clearly.

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

test("home page lists all integrations contributed via the slot", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /integration setup/i })).toBeVisible();
  await page.getByTestId("start-journey").click();

  // Every contributing module surfaces one row — github + strapi (with their
  // own components) and contentful + notion (headless slot-only modules).
  await expect(page.getByTestId("integration-list").getByRole("listitem")).toHaveCount(4);
  await expect(page.getByTestId("pick-github")).toBeVisible();
  await expect(page.getByTestId("pick-strapi")).toBeVisible();
  await expect(page.getByTestId("pick-contentful")).toBeVisible();
  await expect(page.getByTestId("pick-notion")).toBeVisible();

  assertNoErrors(errors);
});

test("github branch dispatches to the dedicated github configure step", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");
  await page.getByTestId("start-journey").click();
  await page.getByTestId("pick-github").click();

  // Dedicated module's heading + repo input — proves selectModuleOrDefault
  // routed to `github`, not the generic fallback.
  await expect(page.getByRole("heading", { name: /configure github/i })).toBeVisible();
  await expect(page.getByTestId("github-repo-input")).toHaveValue("modular-react/example");

  await page.getByTestId("github-save").click();

  const payload = await page.getByTestId("result-payload").textContent();
  expect(payload).toBeTruthy();
  const parsed = JSON.parse(payload!);
  expect(parsed).toMatchObject({ kind: "github", repo: "modular-react/example" });
  // `webhookId` is in the redaction set — Home masks it before render so
  // the demo doesn't teach the bad habit of printing credentials.
  expect(parsed.webhookId).toBe("[redacted]");

  assertNoErrors(errors);
});

test("strapi branch dispatches to the dedicated strapi configure step", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");
  await page.getByTestId("start-journey").click();
  await page.getByTestId("pick-strapi").click();

  await expect(page.getByRole("heading", { name: /configure strapi/i })).toBeVisible();
  // Strapi's bespoke fields — exclusive to the dedicated module.
  await expect(page.getByTestId("strapi-baseurl-input")).toBeVisible();
  await expect(page.getByTestId("strapi-token-input")).toBeVisible();

  await page.getByTestId("strapi-token-input").fill("strapi-secret-token");
  await page.getByTestId("strapi-save").click();

  const payload = await page.getByTestId("result-payload").textContent();
  const parsed = JSON.parse(payload!);
  // Non-secret fields render verbatim; `apiToken` is masked by Home's
  // redaction pass.
  expect(parsed).toMatchObject({
    kind: "strapi",
    baseUrl: "https://strapi.example.com",
    apiToken: "[redacted]",
  });

  assertNoErrors(errors);
});

test("contentful branch falls through to the generic module", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");
  await page.getByTestId("start-journey").click();
  await page.getByTestId("pick-contentful").click();

  // Generic module's heading reflects the kind that fell through. If the
  // dispatch had a stale specific case for contentful we'd land on a
  // dedicated component instead.
  await expect(page.getByTestId("generic-title")).toHaveText(/configure contentful/i);
  await expect(page.getByTestId("generic-apikey-input")).toBeVisible();

  await page.getByTestId("generic-apikey-input").fill("contentful-key");
  await page.getByTestId("generic-save").click();

  const parsed = JSON.parse((await page.getByTestId("result-payload").textContent())!);
  // `kind` confirms the fallback dispatch chose `contentful`; `apiKey` is
  // masked because the redaction pass treats it as a secret.
  expect(parsed).toMatchObject({ kind: "contentful", apiKey: "[redacted]" });

  assertNoErrors(errors);
});

test("notion branch also falls through to the generic module", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");
  await page.getByTestId("start-journey").click();
  await page.getByTestId("pick-notion").click();

  await expect(page.getByTestId("generic-title")).toHaveText(/configure notion/i);
  await page.getByTestId("generic-apikey-input").fill("notion-key");
  await page.getByTestId("generic-save").click();

  const parsed = JSON.parse((await page.getByTestId("result-payload").textContent())!);
  expect(parsed).toMatchObject({ kind: "notion", apiKey: "[redacted]" });

  assertNoErrors(errors);
});

test("cancelling on the chooser aborts the journey", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");
  await page.getByTestId("start-journey").click();

  await page.getByRole("button", { name: /^Cancel$/ }).click();

  await expect(page.getByRole("heading", { name: /journey aborted/i })).toBeVisible();
  const parsed = JSON.parse((await page.getByTestId("result-payload").textContent())!);
  expect(parsed).toMatchObject({ reason: "user-cancelled" });

  assertNoErrors(errors);
});

test("the result panel resets so a second journey runs cleanly", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");
  await page.getByTestId("start-journey").click();
  await page.getByTestId("pick-notion").click();
  await page.getByTestId("generic-apikey-input").fill("first-run");
  await page.getByTestId("generic-save").click();

  await page.getByTestId("run-again").click();

  // Round-trip a second branch (specific this time) so we'd notice if any
  // state from the previous run leaked into the new instance.
  await page.getByTestId("start-journey").click();
  await page.getByTestId("pick-github").click();
  await page.getByTestId("github-save").click();

  const parsed = JSON.parse((await page.getByTestId("result-payload").textContent())!);
  expect(parsed.kind).toBe("github");

  assertNoErrors(errors);
});
