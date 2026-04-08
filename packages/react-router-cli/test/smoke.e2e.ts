import { test, expect } from "@playwright/test";

test("home page renders with welcome message", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
});

test("sidebar shows module navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard List" })).toBeVisible();
});

test("navigates to module dashboard page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Please log in to continue.")).toBeVisible();
});

test("navigates to module list page via sidebar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Dashboard List" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard List" })).toBeVisible();
});

test("navigates to module list page via in-page link", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.getByRole("link", { name: /view dashboard list/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard List" })).toBeVisible();
});

test("login and logout flow works", async ({ page }) => {
  await page.goto("/");

  // Login
  await page.getByRole("button", { name: /login/i }).click();
  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  await expect(page.getByText("Demo User", { exact: true })).toBeVisible();

  // Navigate to module — should show authenticated content
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByText("Welcome, Demo User.")).toBeVisible();

  // Logout
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
});

test("navigates back to home from module", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("link", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
});
