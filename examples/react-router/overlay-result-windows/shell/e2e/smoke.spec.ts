import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

// Smoke + behavioral coverage for the state-keyed overlay host
// (`<OverlayOutlet>` / `useOverlay` / `useOverlaySubject` / `useModalBehavior`)
// mounted in a React Router shell. Mirrors the sibling examples' e2e style: a
// page/console-error collector wraps every test so runtime regressions
// (duplicate-module copies, uncaught render errors) surface as failures
// regardless of the specific UI assertion.
//
// Only `console.error` is treated as a failure — the dangling-id test
// deliberately triggers the host's dev `console.warn`, which is expected.

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

const backdrop = "[data-modular-overlay-backdrop]";
const panel = "[data-modular-overlay-panel]";

/** The id of the currently-open window, or null when closed. */
async function openWindowId(page: Page): Promise<string | null> {
  const el = page.locator(backdrop);
  if ((await el.count()) === 0) return null;
  return el.getAttribute("data-overlay-id");
}

/** Whether keyboard focus currently sits inside the dialog panel. */
async function focusInsidePanel(page: Page): Promise<boolean> {
  return page.evaluate((sel) => {
    const p = document.querySelector(sel);
    return !!p && !!document.activeElement && p.contains(document.activeElement);
  }, panel);
}

test("closed by default: empty placeholder, no dialog", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await expect(page.getByTestId("overlay-closed")).toBeVisible();
  await expect(page.locator(panel)).toHaveCount(0);

  assertNoErrors(errors);
});

test("opening a window mounts the managed modal shell (a11y + focus)", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("open-test-report").click();

  const dialog = page.locator(panel);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  // `title(subject)` resolved against the selected step (step 0 by default) and
  // wired to the dialog's aria-label with zero app effort.
  await expect(dialog).toHaveAttribute("aria-label", "Test report — step 0");
  await expect(page.getByTestId("overlay-title")).toHaveText("Test report — step 0");
  expect(await openWindowId(page)).toBe("test-report");
  // Focus was moved into the dialog on open.
  expect(await focusInsidePanel(page)).toBe(true);
  await expect(page.getByTestId("overlay-closed")).toHaveCount(0);

  assertNoErrors(errors);
});

test("Escape requests close and returns focus to the opener", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("open-test-report").click();
  await expect(page.locator(panel)).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.locator(panel)).toHaveCount(0);
  await expect(page.getByTestId("overlay-closed")).toBeVisible();
  // Focus returned to the button that opened the window.
  const focusedTestId = await page.evaluate(() =>
    document.activeElement?.getAttribute("data-testid"),
  );
  expect(focusedTestId).toBe("open-test-report");

  assertNoErrors(errors);
});

test("backdrop press-and-release closes; the ✕ closes", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  // Backdrop click (top-left corner, clear of the centred panel).
  await page.getByTestId("open-run-logs").click();
  await expect(page.locator(panel)).toBeVisible();
  await page.locator(backdrop).click({ position: { x: 6, y: 6 } });
  await expect(page.locator(panel)).toHaveCount(0);

  // The chrome's close button.
  await page.getByTestId("open-run-logs").click();
  await expect(page.locator(panel)).toBeVisible();
  await page.getByTestId("overlay-close").click();
  await expect(page.locator(panel)).toHaveCount(0);

  assertNoErrors(errors);
});

test("a press that starts inside the dialog and releases on the backdrop does NOT close", async ({
  page,
}) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("open-test-report").click();
  const box = await page.locator(panel).boundingBox();
  if (!box) throw new Error("panel has no bounding box");

  // Press inside the panel, drag onto the backdrop, release there — a text
  // selection / missed drag, not a close request.
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(6, 6);
  await page.mouse.up();

  await expect(page.locator(panel)).toBeVisible();

  assertNoErrors(errors);
});

test("one window at a time: switching swaps without closing, keeping a single dialog", async ({
  page,
}) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("open-test-report").click();
  expect(await openWindowId(page)).toBe("test-report");
  await expect(page.getByTestId("window-body-test-report")).toBeVisible();

  // The switcher lives inside the dialog (the backdrop covers the openers
  // behind it): switching sets the active id to a sibling — a swap, not a close.
  await page.getByTestId("switch-run-logs").click();
  // Still exactly one backdrop / one panel — the host is pick-one.
  await expect(page.locator(backdrop)).toHaveCount(1);
  await expect(page.locator(panel)).toHaveCount(1);
  expect(await openWindowId(page)).toBe("run-logs");
  await expect(page.getByTestId("window-body-run-logs")).toBeVisible();
  await expect(page.getByTestId("window-body-test-report")).toHaveCount(0);
  // Focus followed the swapped-in content (re-applied on the content-key change).
  expect(await focusInsidePanel(page)).toBe(true);

  assertNoErrors(errors);
});

test("the consumer window opens with no host edit", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("open-security-report").click();

  expect(await openWindowId(page)).toBe("acme:security-report");
  await expect(page.getByTestId("window-body-acme-security-report")).toBeVisible();
  await expect(page.getByTestId("overlay-title")).toHaveText("Security report");

  assertNoErrors(errors);
});

test("the subject is threaded to the window and swaps with the selected step", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("step-1").click();
  await page.getByTestId("open-run-logs").click();
  // `run-logs` reads the subject via `useOverlaySubject` (no prop-drilling).
  await expect(page.getByTestId("window-body-run-logs")).toContainText("step 1");
  await expect(page.getByTestId("window-body-run-logs")).toContainText("Typecheck");

  // Switch to test-report (inside the dialog): it reads the same subject via its
  // injected `subject` prop, and the title re-resolves against the same step.
  await page.getByTestId("switch-test-report").click();
  await expect(page.getByTestId("overlay-title")).toHaveText("Test report — step 1");
  await expect(page.getByTestId("window-body-test-report")).toContainText("Typecheck");

  assertNoErrors(errors);
});

test("nested bespoke overlay shares the stack: Escape closes the top first", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("open-test-report").click();
  await expect(page.locator(panel)).toBeVisible();

  // Open the nested confirm (built on `useModalBehavior`) inside the window.
  await page.getByTestId("open-confirm").click();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();

  // First Escape closes the topmost overlay — the confirm — leaving the window.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(page.locator(panel)).toBeVisible();

  // Second Escape closes the window beneath it.
  await page.keyboard.press("Escape");
  await expect(page.locator(panel)).toHaveCount(0);

  assertNoErrors(errors);
});

test("a dangling active id is data, not a crash: renders nothing, no error", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await page.goto("/");

  await page.getByTestId("open-dangling").click();

  // No window mounts; the empty placeholder stays; the app is still interactive.
  await expect(page.locator(panel)).toHaveCount(0);
  await expect(page.getByTestId("overlay-closed")).toBeVisible();

  // A real window still opens afterwards — the dangling id didn't wedge state.
  await page.getByTestId("open-test-report").click();
  await expect(page.locator(panel)).toBeVisible();

  // The dev `console.warn` for the dangling id is expected; only errors fail.
  assertNoErrors(errors);
});
