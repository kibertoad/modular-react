import { defineCatalogConfig } from "@modular-react/catalog";

/**
 * Mock operational data per owning team. In a real catalog these values
 * would come from on-call schedulers (PagerDuty / Opsgenie), CD systems,
 * and observability backends — the extension tab pulls them in at build
 * time so the SPA itself stays a static artifact.
 */
const TEAM_OPS: Readonly<
  Record<string, { onCall: string; slack: string; pagerduty: string; dashboard: string }>
> = {
  "billing-platform": {
    onCall: "Priya Anand",
    slack: "#billing-oncall",
    pagerduty: "https://acme.pagerduty.com/services/billing",
    dashboard: "https://grafana.internal/d/billing-overview",
  },
  "onboarding-core": {
    onCall: "Mateo Reyes",
    slack: "#onboarding-oncall",
    pagerduty: "https://acme.pagerduty.com/services/onboarding",
    dashboard: "https://grafana.internal/d/onboarding-funnel",
  },
  growth: {
    onCall: "Aisha Okafor",
    slack: "#growth-oncall",
    pagerduty: "https://acme.pagerduty.com/services/growth",
    dashboard: "https://grafana.internal/d/growth-experiments",
  },
  checkout: {
    onCall: "Yuki Tanaka",
    slack: "#checkout-oncall",
    pagerduty: "https://acme.pagerduty.com/services/checkout",
    dashboard: "https://grafana.internal/d/checkout-conversion",
  },
  "trust-and-safety": {
    onCall: "Lars Kowalski",
    slack: "#trust-safety-oncall",
    pagerduty: "https://acme.pagerduty.com/services/trust-safety",
    dashboard: "https://grafana.internal/d/identity-verifications",
  },
};

function renderModuleRunbook(
  moduleId: string,
  team: string,
  status: string | undefined,
): string | undefined {
  const ops = TEAM_OPS[team];
  if (!ops) return undefined;

  // Synthesise a plausible deploy timeline so the tab looks lived-in.
  const today = new Date("2026-05-01T00:00:00Z");
  const deploys = [0, 7, 21].map((daysAgo, i) => {
    const date = new Date(today.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const ymd = date.toISOString().slice(0, 10);
    const version = ["1.0.0", "0.9.6", "0.9.5"][i]!;
    return `<li><code>${escapeHtml(version)}</code> &mdash; ${escapeHtml(ymd)}</li>`;
  });

  const statusLine = status
    ? `<p><strong>Status:</strong> <code>${escapeHtml(status)}</code></p>`
    : "";
  const slackChannel = encodeURIComponent(ops.slack.slice(1));
  const slackHref = `https://acme.slack.com/channels/${slackChannel}`;

  // Build-time HTML render. Escape all interpolated values so the generated
  // tab remains safe if the fixture data is replaced by external metadata.
  return `
    <div data-testid="runbook-${escapeHtml(moduleId)}">
      <h4 style="margin: 0 0 0.25rem 0;">On-call &amp; escalation</h4>
      <ul>
        <li><strong>Owner team:</strong> ${escapeHtml(team)}</li>
        <li><strong>Primary on-call:</strong> ${escapeHtml(ops.onCall)}</li>
        <li><strong>Slack:</strong> <a href="${escapeAttribute(slackHref)}">${escapeHtml(ops.slack)}</a></li>
        <li><strong>PagerDuty:</strong> <a href="${escapeAttribute(ops.pagerduty)}">${escapeHtml(ops.pagerduty)}</a></li>
      </ul>

      <h4 style="margin: 1rem 0 0.25rem 0;">Observability</h4>
      <p>Dashboard: <a href="${escapeAttribute(ops.dashboard)}">${escapeHtml(ops.dashboard)}</a></p>
      ${statusLine}

      <h4 style="margin: 1rem 0 0.25rem 0;">Recent deploys</h4>
      <ul>${deploys.join("")}</ul>

      <p style="margin-top: 1rem; font-size: 0.85em; color: #666;">
        <em>Mock data &mdash; in a real deployment the catalog config would
        pull this from PagerDuty, your CD system, and Grafana at build time.</em>
      </p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch]!);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

const HTML_ESCAPE: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Demo catalog config. Scans both tanstack-router example apps in this
 * monorepo so the generated catalog has multiple modules and multiple
 * journeys to display — useful as a "what does this look like populated"
 * demo and as the target for the package's e2e tests.
 *
 * `cwd` is set per-root to the example directory; the config file itself
 * lives in `examples/catalog/`, so we walk up to the repo root and back
 * down. Patterns are scoped to that example's `modules/` and `journeys/`
 * subdirs so we don't pick up the example's own shell or app-shared code.
 */
export default defineCatalogConfig({
  out: "dist-catalog",
  title: "Modular-React — Examples Catalog",

  roots: [
    {
      name: "onboarding-modules",
      cwd: "../tanstack-router/customer-onboarding-journey",
      pattern: "modules/*/src/index.ts",
      resolver: "defaultExport",
    },
    {
      name: "onboarding-journeys",
      cwd: "../tanstack-router/customer-onboarding-journey",
      pattern: "journeys/*/src/index.ts",
      // The journey is exposed as a named export (`customerOnboardingJourney`)
      // and re-exported from the journey's `index.ts`. The bare
      // "namedExport" picker walks the namespace and grabs the first
      // export that duck-types as a journey definition.
      resolver: "namedExport",
    },
    {
      name: "checkout-modules",
      cwd: "../tanstack-router/journey-invoke",
      pattern: "modules/*/src/index.ts",
      resolver: "defaultExport",
    },
    {
      name: "checkout-journeys",
      cwd: "../tanstack-router/journey-invoke",
      pattern: "journeys/*/src/index.ts",
      resolver: "namedExport",
    },
  ],

  theme: {
    brandName: "Modular-React Catalog (demo)",
    primaryColor: "#0E7C66",
  },

  // Demonstrate the build-time extension API: a custom facet derived from the
  // module's tags, plus an extra detail tab on each module's page.
  extensions: {
    facets: [
      {
        key: "compliance",
        label: "Compliance",
        source: (entry) => {
          if (entry.meta.tags?.includes("payments")) return ["pci", "soc2"];
          if (entry.meta.tags?.includes("identity")) return ["soc2"];
          return undefined;
        },
      },
    ],
    moduleDetailTabs: [
      {
        // A "runbook" tab is the canonical use case for an extension tab —
        // it surfaces operational context the descriptor itself doesn't
        // carry (on-call rotations, dashboards, recent deploys, postmortem
        // links, etc.) and would normally be assembled from internal
        // services at build time. Here we synthesise plausible content
        // from the harvested metadata so the demo shows what such a tab
        // looks like when populated.
        id: "runbook",
        label: "Runbook",
        render: (entry) => {
          if (entry.kind !== "module" || !entry.meta.ownerTeam) return undefined;
          return renderModuleRunbook(entry.id, entry.meta.ownerTeam, entry.meta.status);
        },
      },
    ],
  },
});
