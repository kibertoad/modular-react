import { describe, it, expect } from "vitest";
import { resolveModule } from "@modular-react/testing";
import type { AppDependencies, AppRemoteManifest } from "@example-active/app-shared";
import integrationsModule from "./index.js";

function makeDeps(
  overrides: Partial<AppDependencies["integrations"]> = {},
): Partial<AppDependencies> {
  return {
    integrations: {
      status: "idle",
      activeProjectId: null,
      activeManifest: null,
      error: null,
      selectProject: async () => {},
      ...overrides,
    },
    integrationsClient: { fetchManifest: async () => null },
  };
}

const salesforceManifest: AppRemoteManifest = {
  id: "integration:salesforce",
  version: "1.0.0",
  slots: {
    integration: [
      {
        id: "salesforce",
        name: "Salesforce",
        category: "crm",
        icon: "crm",
        description: "CRM",
        authentication: { type: "oauth" },
        filters: [{ id: "search", type: "search", query: "name={value}" }],
        capabilities: {
          importTracking: { version: 1, data: { pollingIntervalMs: 5000 } },
        },
      },
    ],
  },
};

describe("integrations module (active-profile topology)", () => {
  it("exposes the active manifest's slots via dynamicSlots", () => {
    const { slots } = resolveModule(integrationsModule, {
      deps: makeDeps({
        status: "ready",
        activeProjectId: "alpha",
        activeManifest: salesforceManifest,
      }),
      defaults: { integration: [] },
    });

    expect(slots.integration).toEqual(salesforceManifest.slots!.integration);
  });

  it("returns empty slots when no project is active", () => {
    const { slots } = resolveModule(integrationsModule, {
      deps: makeDeps(),
      defaults: { integration: [] },
    });

    expect(slots.integration).toEqual([]);
  });

  it("does not register a lifecycle.onRegister — the fetch is UI-driven", () => {
    const { onRegisterCalled } = resolveModule(integrationsModule, {
      deps: makeDeps(),
      defaults: { integration: [] },
    });

    expect(onRegisterCalled).toBe(false);
  });
});
