import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

// E2E coverage for the remote-capabilities + journey example. The catalog
// tiles come from `shell/public/integrations.json` (merged via
// `mergeRemoteManifests`) and the journey's `selectModuleOrDefault` decides
// which configure step renders:
//
//   tile click → start(integrationSetupHandle, { integration }) → start()
//             → (salesforce | hubspot)        specific dispatch (cases)
//             → (zendesk | mixpanel | …)      fallback to generic module
//
// Each branch has its own assertion on the terminal payload's `kind`, so a
// regression that mis-routes a kind (e.g. salesforce → generic) fails clearly.

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

async function gotoIntegrations(page: Page) {
  await page.goto("/integrations");
  // Wait until the manifest fetch resolves and the catalog tiles render.
  await expect(page.getByTestId("status-banner")).toHaveAttribute("data-status", "ready");
  await expect(page.getByTestId("catalog-grid")).toBeVisible();
}

test("catalog page renders one tile per remote-manifest entry", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await gotoIntegrations(page);

  // Four manifests in shell/public/integrations.json — one tile each.
  await expect(page.getByTestId("integration-card-salesforce")).toBeVisible();
  await expect(page.getByTestId("integration-card-hubspot")).toBeVisible();
  await expect(page.getByTestId("integration-card-zendesk")).toBeVisible();
  await expect(page.getByTestId("integration-card-mixpanel")).toBeVisible();

  // Capability-gated chips: Salesforce has both importTracking + contactSync.
  const sf = page.getByTestId("integration-card-salesforce");
  await expect(sf.getByText(/^Import \(poll/)).toBeVisible();
  await expect(sf.getByText(/^Sync \(bidirectional\)$/)).toBeVisible();

  // Mixpanel declares no capabilities — the read-only fallback message renders.
  const mp = page.getByTestId("integration-card-mixpanel");
  await expect(mp.getByText(/read-only integration/i)).toBeVisible();

  assertNoErrors(errors);
});

test("salesforce tile dispatches to the dedicated salesforce configure step", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await gotoIntegrations(page);

  await page.getByTestId("configure-salesforce").click();

  // Dedicated module's heading + bespoke fields — proves selectModuleOrDefault
  // routed to `salesforce`, not the generic fallback.
  await expect(page.getByTestId("salesforce-title")).toBeVisible();
  await expect(page.getByTestId("salesforce-instance-input")).toHaveValue(
    "https://acme.my.salesforce.com",
  );
  await expect(page.getByTestId("salesforce-env-production")).toBeChecked();

  // Pick the sandbox env to prove the field round-trips into the saved payload.
  await page.getByTestId("salesforce-env-sandbox").click();
  await page.getByTestId("salesforce-save").click();

  const payload = await page.getByTestId("result-payload").textContent();
  expect(payload).toBeTruthy();
  const parsed = JSON.parse(payload!);
  expect(parsed).toMatchObject({
    kind: "salesforce",
    instanceUrl: "https://acme.my.salesforce.com",
    // accessToken contains the env tag — but it's masked by Home's redaction
    // pass before reaching the DOM, so we only assert on `[redacted]` here.
    accessToken: "[redacted]",
  });

  // The tile re-renders with a "Connected" badge once the journey completes.
  await page.getByTestId("result-dismiss").click();
  await expect(page.getByTestId("connected-salesforce")).toBeVisible();

  assertNoErrors(errors);
});

test("hubspot tile dispatches to the dedicated hubspot configure step", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await gotoIntegrations(page);

  await page.getByTestId("configure-hubspot").click();

  await expect(page.getByTestId("hubspot-title")).toBeVisible();
  // HubSpot's bespoke fields — exclusive to the dedicated module.
  await expect(page.getByTestId("hubspot-portal-input")).toBeVisible();
  await expect(page.getByTestId("hubspot-token-input")).toBeVisible();

  await page.getByTestId("hubspot-portal-input").fill("12345678");
  await page.getByTestId("hubspot-token-input").fill("pat-na1-abc-123");
  await page.getByTestId("hubspot-save").click();

  const parsed = JSON.parse((await page.getByTestId("result-payload").textContent())!);
  // Non-secret portalId renders verbatim; privateAppToken is masked.
  expect(parsed).toMatchObject({
    kind: "hubspot",
    portalId: "12345678",
    privateAppToken: "[redacted]",
  });

  assertNoErrors(errors);
});

test("zendesk tile falls through to the generic configure step", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await gotoIntegrations(page);

  await page.getByTestId("configure-zendesk").click();

  // Generic module's heading reflects the kind that fell through — if the
  // dispatch had a stale specific case for zendesk we'd land on a dedicated
  // component instead.
  await expect(page.getByTestId("generic-title")).toHaveText(/configure zendesk/i);
  await expect(page.getByTestId("generic-apikey-input")).toBeVisible();

  await page.getByTestId("generic-apikey-input").fill("zendesk-key");
  await page.getByTestId("generic-save").click();

  const parsed = JSON.parse((await page.getByTestId("result-payload").textContent())!);
  // `kind` confirms the fallback chose `zendesk`; `apiKey` is in the
  // redaction set.
  expect(parsed).toMatchObject({ kind: "zendesk", apiKey: "[redacted]" });

  assertNoErrors(errors);
});

test("mixpanel tile also falls through to the generic configure step", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await gotoIntegrations(page);

  await page.getByTestId("configure-mixpanel").click();

  await expect(page.getByTestId("generic-title")).toHaveText(/configure mixpanel/i);
  await page.getByTestId("generic-apikey-input").fill("mixpanel-key");
  await page.getByTestId("generic-save").click();

  const parsed = JSON.parse((await page.getByTestId("result-payload").textContent())!);
  expect(parsed).toMatchObject({ kind: "mixpanel", apiKey: "[redacted]" });

  assertNoErrors(errors);
});

test("cancelling on a configure step aborts the journey without marking connected", async ({
  page,
}) => {
  const errors = attachErrorCollectors(page);
  await gotoIntegrations(page);

  await page.getByTestId("configure-hubspot").click();
  await page.getByTestId("hubspot-cancel").click();

  // Terminal panel renders with status=aborted; "Connected" badge does NOT
  // appear because the journey didn't complete successfully.
  await expect(page.getByTestId("result")).toHaveAttribute("data-status", "aborted");
  const parsed = JSON.parse((await page.getByTestId("result-payload").textContent())!);
  expect(parsed).toMatchObject({ reason: "user-cancelled" });

  await page.getByTestId("result-dismiss").click();
  await expect(page.getByTestId("connected-hubspot")).toHaveCount(0);

  assertNoErrors(errors);
});

test("two journeys back-to-back stay isolated (no state leak)", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await gotoIntegrations(page);

  // First run: generic branch.
  await page.getByTestId("configure-mixpanel").click();
  await page.getByTestId("generic-apikey-input").fill("first-run");
  await page.getByTestId("generic-save").click();
  await page.getByTestId("result-dismiss").click();

  // Second run: specific branch — assert we land on the bespoke salesforce
  // form (not the lingering generic one) and the resulting payload matches.
  await page.getByTestId("configure-salesforce").click();
  await expect(page.getByTestId("salesforce-title")).toBeVisible();
  await page.getByTestId("salesforce-save").click();

  const parsed = JSON.parse((await page.getByTestId("result-payload").textContent())!);
  expect(parsed.kind).toBe("salesforce");

  // Both tiles end up in the connected set.
  await page.getByTestId("result-dismiss").click();
  await expect(page.getByTestId("connected-mixpanel")).toBeVisible();
  await expect(page.getByTestId("connected-salesforce")).toBeVisible();

  assertNoErrors(errors);
});

test("reconfiguring a connected integration restarts the journey", async ({ page }) => {
  const errors = attachErrorCollectors(page);
  await gotoIntegrations(page);

  await page.getByTestId("configure-mixpanel").click();
  await page.getByTestId("generic-apikey-input").fill("first-key");
  await page.getByTestId("generic-save").click();
  await page.getByTestId("result-dismiss").click();

  // Once connected, the button label flips to "Reconfigure" — clicking it
  // mints a fresh journey instance against the same integration definition.
  const tile = page.getByTestId("integration-card-mixpanel");
  await expect(tile.getByTestId("connected-mixpanel")).toBeVisible();
  await expect(tile.getByTestId("configure-mixpanel")).toHaveText(/reconfigure/i);

  await tile.getByTestId("configure-mixpanel").click();
  await expect(page.getByTestId("generic-title")).toHaveText(/configure mixpanel/i);
  // Field is empty in the new instance — proves it isn't a stale form re-mount.
  await expect(page.getByTestId("generic-apikey-input")).toHaveValue("");

  assertNoErrors(errors);
});
