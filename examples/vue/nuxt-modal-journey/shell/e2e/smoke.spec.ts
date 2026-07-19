import { test, expect } from "@playwright/test";

test("modal journey: appProvides threading, Pinia persistence, in-session + reload resume", async ({
  page,
}) => {
  await page.goto("/");

  // Open frame A → step 1. The journey renders with NO <JourneyProvider> in the
  // tree, so the runtime must have come from the app-level provide that
  // installModularApp installed via the journeys plugin's appProvides hook.
  await page.getByTestId("open-frame-a").click();
  await expect(page.getByTestId("wizard-modal")).toBeVisible();
  await expect(page.getByTestId("step-choose")).toBeVisible();

  // Pick "pro" and advance → step 2.
  await page.getByTestId("plan-pro").check();
  await page.getByTestId("wizard-continue").click();
  await expect(page.getByTestId("step-confirm")).toBeVisible();
  await expect(page.getByTestId("confirm-plan")).toHaveText("pro");

  // The Pinia persistence adapter stored the in-flight journey (save path).
  await expect(page.getByTestId("persisted-keys")).toHaveText("journey:A:setup-wizard");

  // Close, reopen → resumes at step 2 in-session (keep-alive subscription kept
  // the instance from being torn down when the outlet unmounted).
  await page.getByTestId("wizard-close").click();
  await expect(page.getByTestId("wizard-modal")).toBeHidden();
  await page.getByTestId("open-frame-a").click();
  await expect(page.getByTestId("step-confirm")).toBeVisible();
  await expect(page.getByTestId("confirm-plan")).toHaveText("pro");

  // Reload, reopen → resumes at step 2 again — this time via the persistence
  // LOAD path (the in-memory instance is gone; the blob is rehydrated from the
  // Pinia store persisted to localStorage).
  await page.reload();
  await expect(page.getByTestId("open-frame-a")).toBeVisible();
  await page.getByTestId("open-frame-a").click();
  await expect(page.getByTestId("step-confirm")).toBeVisible();
  await expect(page.getByTestId("confirm-plan")).toHaveText("pro");

  // Confirm → completes; the modal closes and the persisted blob is removed on
  // terminal.
  await page.getByTestId("wizard-confirm").click();
  await expect(page.getByTestId("wizard-modal")).toBeHidden();
  await expect(page.getByTestId("persisted-keys")).toHaveText("");

  // Reopen → fresh step 1 (the completed instance is gone).
  await page.getByTestId("open-frame-a").click();
  await expect(page.getByTestId("step-choose")).toBeVisible();
});

test("cancel discards the flow and its persisted blob", async ({ page }) => {
  await page.goto("/");

  // Open frame A and advance so a blob is persisted.
  await page.getByTestId("open-frame-a").click();
  await page.getByTestId("plan-pro").check();
  await page.getByTestId("wizard-continue").click();
  await expect(page.getByTestId("step-confirm")).toBeVisible();
  await expect(page.getByTestId("persisted-keys")).toHaveText("journey:A:setup-wizard");

  // Cancel = runtime.discard(id): ends the instance AND removes the blob, unlike
  // Close (which keeps it). The persisted key set goes empty.
  await page.getByTestId("wizard-cancel").click();
  await expect(page.getByTestId("wizard-modal")).toBeHidden();
  await expect(page.getByTestId("persisted-keys")).toHaveText("");

  // Reopen → fresh step 1, not a resume: the flow was thrown away.
  await page.getByTestId("open-frame-a").click();
  await expect(page.getByTestId("step-choose")).toBeVisible();
});

test("a different frame runs an independent instance", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("open-frame-b").click();
  await expect(page.getByTestId("step-choose")).toBeVisible();

  await page.getByTestId("plan-standard").check();
  await page.getByTestId("wizard-continue").click();

  // Keyed by frame, so frame B is its own instance under its own key.
  await expect(page.getByTestId("persisted-keys")).toHaveText("journey:B:setup-wizard");
});
