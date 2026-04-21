import { describe, it, expect } from "vitest";
import { resolveModule } from "@modular-react/testing";
import type { AppDependencies, AppRemoteManifest } from "@example/app-shared";
import integrationsModule from "./index.js";

function makeDeps(
  overrides: Partial<AppDependencies["integrations"]> = {},
  fetchManifests: () => Promise<readonly AppRemoteManifest[]> = async () => [],
): Partial<AppDependencies> {
  return {
    integrations: {
      status: "idle",
      manifests: [],
      error: null,
      setManifests: () => {},
      setStatus: () => {},
      setError: () => {},
      ...overrides,
    },
    integrationsClient: { fetchManifests },
  };
}

describe("integrations module", () => {
  it("exposes merged slots from pre-seeded manifests via dynamicSlots", () => {
    const manifests: readonly AppRemoteManifest[] = [
      {
        id: "integration:salesforce",
        version: "1.0.0",
        slots: {
          integrations: [
            {
              id: "sf",
              name: "Salesforce",
              category: "crm",
              icon: "crm",
              description: "CRM",
            },
          ],
        },
      },
    ];

    const { slots } = resolveModule(integrationsModule, {
      deps: makeDeps({ manifests, status: "ready" }),
      defaults: { integrations: [] },
    });

    expect(slots.integrations).toEqual([
      { id: "sf", name: "Salesforce", category: "crm", icon: "crm", description: "CRM" },
    ]);
  });

  it("returns empty slots when no manifests have been fetched yet", () => {
    const { slots } = resolveModule(integrationsModule, {
      deps: makeDeps(),
      defaults: { integrations: [] },
    });

    expect(slots.integrations).toEqual([]);
  });

  it("kicks off fetchManifests in onRegister and writes to the store on success", async () => {
    const captured: AppRemoteManifest[][] = [];
    const manifests: readonly AppRemoteManifest[] = [
      {
        id: "integration:hubspot",
        version: "1.0.0",
        slots: {
          integrations: [
            {
              id: "hs",
              name: "HubSpot",
              category: "crm",
              icon: "crm",
              description: "CRM",
            },
          ],
        },
      },
    ];

    const deps = makeDeps(
      {
        setManifests: (m) => captured.push([...m]),
      },
      async () => manifests,
    );

    const { onRegisterCalled } = resolveModule(integrationsModule, {
      deps,
      defaults: { integrations: [] },
    });

    expect(onRegisterCalled).toBe(true);
    // onRegister fires `.then` — flush microtasks so the setManifests call lands.
    await Promise.resolve();
    await Promise.resolve();
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual(manifests);
  });

  it("routes fetch errors through setError + setStatus('error')", async () => {
    const errors: string[] = [];
    let lastStatus: string | null = null;

    const deps = makeDeps(
      {
        setError: (e) => {
          if (e != null) errors.push(e);
        },
        setStatus: (s) => {
          lastStatus = s;
        },
      },
      async () => {
        throw new Error("backend is down");
      },
    );

    resolveModule(integrationsModule, { deps, defaults: { integrations: [] } });

    await Promise.resolve();
    await Promise.resolve();

    expect(errors).toContain("backend is down");
    expect(lastStatus).toBe("error");
  });
});
