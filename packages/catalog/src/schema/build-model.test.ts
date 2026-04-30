import { describe, expect, it } from "vitest";
import type { CatalogJourneyEntry, CatalogModuleEntry } from "../config/types.js";
import { buildCatalogModel } from "./build-model.js";

const moduleEntry = (
  overrides: Partial<CatalogModuleEntry> & { id: string },
): CatalogModuleEntry => ({
  kind: "module",
  id: overrides.id,
  version: overrides.version ?? "1.0.0",
  sourcePath: overrides.sourcePath ?? `/abs/${overrides.id}.ts`,
  rootName: overrides.rootName ?? "modules",
  meta: overrides.meta ?? {},
  extraMeta: overrides.extraMeta ?? {},
  slotKeys: overrides.slotKeys ?? [],
  hasRoutes: overrides.hasRoutes ?? false,
  hasComponent: overrides.hasComponent ?? false,
  requires: overrides.requires ?? [],
  optionalRequires: overrides.optionalRequires ?? [],
  entryPointNames: overrides.entryPointNames ?? [],
  exitPointNames: overrides.exitPointNames ?? [],
  navigationLabels: overrides.navigationLabels ?? [],
  startsJourneyIds: overrides.startsJourneyIds ?? [],
  descriptor: overrides.descriptor ?? ({} as never),
});

const journeyEntry = (
  overrides: Partial<CatalogJourneyEntry> & { id: string; modulesUsed: string[] },
): CatalogJourneyEntry => ({
  kind: "journey",
  id: overrides.id,
  version: overrides.version ?? "1.0.0",
  sourcePath: overrides.sourcePath ?? `/abs/journeys/${overrides.id}.ts`,
  rootName: overrides.rootName ?? "journeys",
  meta: overrides.meta ?? {},
  extraMeta: overrides.extraMeta ?? {},
  modulesUsed: overrides.modulesUsed,
  invokesJourneyIds: overrides.invokesJourneyIds ?? [],
  moduleCompat: overrides.moduleCompat ?? {},
  transitionShape: overrides.transitionShape ?? {},
  transitionDestinations: overrides.transitionDestinations ?? {},
  descriptor: overrides.descriptor ?? {},
});

describe("buildCatalogModel", () => {
  it("emits a stable schemaVersion and ISO builtAt", () => {
    const model = buildCatalogModel([], { title: "T" });
    expect(model.schemaVersion).toBe("2");
    expect(() => new Date(model.builtAt).toISOString()).not.toThrow();
    expect(model.title).toBe("T");
  });

  it("partitions modules and journeys, sorted by id", () => {
    const model = buildCatalogModel(
      [
        moduleEntry({ id: "z" }),
        moduleEntry({ id: "a" }),
        journeyEntry({ id: "y", modulesUsed: ["a"] }),
        journeyEntry({ id: "b", modulesUsed: ["z"] }),
      ],
      { title: "T" },
    );
    expect(model.modules.map((m) => m.id)).toEqual(["a", "z"]);
    expect(model.journeys.map((j) => j.id)).toEqual(["b", "y"]);
  });

  it("computes deduped, sorted facets", () => {
    const model = buildCatalogModel(
      [
        moduleEntry({
          id: "a",
          meta: {
            ownerTeam: "platform",
            domain: "billing",
            tags: ["a", "b"],
            status: "stable",
          },
        }),
        moduleEntry({
          id: "b",
          meta: {
            ownerTeam: "growth",
            domain: "billing",
            tags: ["b", "c"],
            status: "experimental",
          },
        }),
      ],
      {},
    );
    expect(model.facets.teams).toEqual(["growth", "platform"]);
    expect(model.facets.domains).toEqual(["billing"]);
    expect(model.facets.tags).toEqual(["a", "b", "c"]);
    expect(model.facets.statuses).toEqual(["experimental", "stable"]);
  });

  it("computes journeysByModule index", () => {
    const model = buildCatalogModel(
      [
        moduleEntry({ id: "profile" }),
        moduleEntry({ id: "billing" }),
        journeyEntry({ id: "j-onboarding", modulesUsed: ["profile", "billing"] }),
        journeyEntry({ id: "j-renewal", modulesUsed: ["billing"] }),
      ],
      {},
    );
    expect(model.journeysByModule).toEqual({
      profile: ["j-onboarding"],
      billing: ["j-onboarding", "j-renewal"],
    });
  });

  it("computes modulesByStartedJourney from startsJourneyIds", () => {
    const model = buildCatalogModel(
      [
        moduleEntry({ id: "checkout-button", startsJourneyIds: ["onboarding", "kyc"] }),
        moduleEntry({ id: "renewal-banner", startsJourneyIds: ["onboarding"] }),
        moduleEntry({ id: "no-launchers" }),
      ],
      {},
    );
    expect(model.modulesByStartedJourney).toEqual({
      onboarding: ["checkout-button", "renewal-banner"],
      kyc: ["checkout-button"],
    });
  });

  it("computes reverse journeysByInvokedJourney index", () => {
    const model = buildCatalogModel(
      [
        journeyEntry({ id: "parent-a", modulesUsed: [], invokesJourneyIds: ["kyc", "fraud"] }),
        journeyEntry({ id: "parent-b", modulesUsed: [], invokesJourneyIds: ["kyc"] }),
        journeyEntry({ id: "kyc", modulesUsed: [] }),
        journeyEntry({ id: "fraud", modulesUsed: [] }),
      ],
      {},
    );
    expect(model.journeysByInvokedJourney).toEqual({
      kyc: ["parent-a", "parent-b"],
      fraud: ["parent-a"],
    });
  });

  it("computes module entry/exit usage from transitionShape", () => {
    const model = buildCatalogModel(
      [
        moduleEntry({ id: "profile" }),
        moduleEntry({ id: "billing" }),
        journeyEntry({
          id: "onboarding",
          modulesUsed: ["profile", "billing"],
          transitionShape: {
            profile: { review: ["profileComplete", "cancelled"] },
            billing: { collect: ["paid", "failed"] },
          },
        }),
        journeyEntry({
          id: "renewal",
          modulesUsed: ["billing"],
          transitionShape: {
            billing: { collect: ["paid"] },
          },
        }),
      ],
      {},
    );

    expect(model.moduleEntryUsage).toEqual({
      profile: {
        review: [{ journeyId: "onboarding", handledExits: ["cancelled", "profileComplete"] }],
      },
      billing: {
        collect: [
          { journeyId: "onboarding", handledExits: ["failed", "paid"] },
          { journeyId: "renewal", handledExits: ["paid"] },
        ],
      },
    });

    expect(model.moduleExitUsage).toEqual({
      profile: {
        profileComplete: [{ journeyId: "onboarding", fromEntry: "review" }],
        cancelled: [{ journeyId: "onboarding", fromEntry: "review" }],
      },
      billing: {
        paid: [
          { journeyId: "onboarding", fromEntry: "collect" },
          { journeyId: "renewal", fromEntry: "collect" },
        ],
        failed: [{ journeyId: "onboarding", fromEntry: "collect" }],
      },
    });
  });

  it("attaches transition destinations to exit usage when AST analysis ran", () => {
    const model = buildCatalogModel(
      [
        moduleEntry({ id: "profile" }),
        journeyEntry({
          id: "onboarding",
          modulesUsed: ["profile"],
          transitionShape: { profile: { review: ["profileComplete", "cancelled"] } },
          transitionDestinations: {
            profile: {
              review: {
                profileComplete: {
                  nexts: [{ module: "plan", entry: "choose" }],
                  aborts: false,
                  completes: false,
                },
                cancelled: { nexts: [], aborts: true, completes: false },
              },
            },
          },
        }),
      ],
      {},
    );

    expect(model.moduleExitUsage.profile!.profileComplete).toEqual([
      {
        journeyId: "onboarding",
        fromEntry: "review",
        destinations: [{ module: "plan", entry: "choose" }],
      },
    ]);
    expect(model.moduleExitUsage.profile!.cancelled).toEqual([
      { journeyId: "onboarding", fromEntry: "review", aborts: true },
    ]);
  });

  it("throws on duplicate module ids", () => {
    expect(() =>
      buildCatalogModel([moduleEntry({ id: "dup" }), moduleEntry({ id: "dup" })], {}),
    ).toThrow(/Duplicate descriptor ids/);
  });

  it("allows the same id in different kinds (module + journey)", () => {
    const model = buildCatalogModel(
      [moduleEntry({ id: "shared-id" }), journeyEntry({ id: "shared-id", modulesUsed: [] })],
      {},
    );
    expect(model.modules.length).toBe(1);
    expect(model.journeys.length).toBe(1);
  });

  it("strips the descriptor field from serialized output", () => {
    const model = buildCatalogModel(
      [
        moduleEntry({
          id: "x",
          descriptor: { id: "x", version: "1", slots: {} } as never,
        }),
      ],
      {},
    );
    expect("descriptor" in model.modules[0]!).toBe(false);
    // And the result must round-trip JSON cleanly.
    expect(() => JSON.parse(JSON.stringify(model))).not.toThrow();
  });

  it("ignores unknown status values when computing facets", () => {
    const model = buildCatalogModel(
      [
        // @ts-expect-error - intentionally using invalid status to verify it's filtered
        moduleEntry({ id: "x", meta: { status: "unknown-status" } }),
      ],
      {},
    );
    expect(model.facets.statuses).toEqual([]);
  });

  describe("extensions", () => {
    it("resolves extension tabs per entry and omits when host returns nothing", () => {
      const model = buildCatalogModel(
        [
          moduleEntry({ id: "a", meta: { ownerTeam: "platform" } }),
          moduleEntry({ id: "b", meta: { ownerTeam: "growth" } }),
        ],
        {
          extensions: {
            moduleDetailTabs: [
              {
                id: "compliance",
                label: "Compliance",
                url: (entry) =>
                  entry.meta.ownerTeam === "platform"
                    ? `https://compliance.internal/${entry.id}`
                    : undefined,
              },
              {
                id: "runbook",
                label: "Runbook",
                render: (entry) => `<p>runbook for ${entry.id}</p>`,
              },
            ],
          },
        },
      );

      const a = model.modules.find((m) => m.id === "a")!;
      const b = model.modules.find((m) => m.id === "b")!;
      expect(a.extensionTabs).toEqual([
        { id: "compliance", label: "Compliance", url: "https://compliance.internal/a" },
        { id: "runbook", label: "Runbook", html: "<p>runbook for a</p>" },
      ]);
      // b's compliance tab is hidden, runbook still present
      expect(b.extensionTabs).toEqual([
        { id: "runbook", label: "Runbook", html: "<p>runbook for b</p>" },
      ]);

      expect(model.extensions?.moduleDetailTabs).toEqual([
        { id: "compliance", label: "Compliance" },
        { id: "runbook", label: "Runbook" },
      ]);
    });

    it("aggregates custom facets across entries and stores per-entry values", () => {
      const model = buildCatalogModel(
        [
          moduleEntry({ id: "a", extraMeta: { compliance: ["soc2"] } }),
          moduleEntry({ id: "b", extraMeta: { compliance: ["pci", "soc2"] } }),
          moduleEntry({ id: "c" }), // no value
        ],
        {
          extensions: {
            facets: [
              {
                key: "compliance",
                label: "Compliance",
                source: (entry) => entry.extraMeta.compliance as string[] | undefined,
              },
            ],
          },
        },
      );

      expect(model.facets.custom).toEqual([
        { key: "compliance", label: "Compliance", values: ["pci", "soc2"] },
      ]);
      const a = model.modules.find((m) => m.id === "a")!;
      const b = model.modules.find((m) => m.id === "b")!;
      const c = model.modules.find((m) => m.id === "c")!;
      expect(a.customFacets).toEqual({ compliance: ["soc2"] });
      expect(b.customFacets).toEqual({ compliance: ["pci", "soc2"] });
      expect(c.customFacets).toBeUndefined();
    });

    it("throws when an extension tab declares neither url nor render", () => {
      expect(() =>
        buildCatalogModel([moduleEntry({ id: "a" })], {
          extensions: {
            moduleDetailTabs: [
              // @ts-expect-error - intentionally invalid: missing both
              { id: "broken", label: "Broken" },
            ],
          },
        }),
      ).toThrow(/declare either `url` or `render`/);
    });

    it("throws when an extension tab declares both url and render", () => {
      expect(() =>
        buildCatalogModel([moduleEntry({ id: "a" })], {
          extensions: {
            moduleDetailTabs: [
              {
                id: "double",
                label: "Double",
                url: () => "https://x",
                render: () => "<p>x</p>",
              },
            ],
          },
        }),
      ).toThrow(/both `url` and `render`/);
    });

    it("emits no extensions metadata when none configured", () => {
      const model = buildCatalogModel([moduleEntry({ id: "a" })], { title: "T" });
      expect(model.extensions).toBeUndefined();
      expect(model.facets.custom).toBeUndefined();
      expect(model.modules[0]!.extensionTabs).toBeUndefined();
      expect(model.modules[0]!.customFacets).toBeUndefined();
    });

    describe("validation", () => {
      it("throws on duplicate moduleDetailTabs ids", () => {
        expect(() =>
          buildCatalogModel([], {
            extensions: {
              moduleDetailTabs: [
                { id: "x", label: "X", render: () => "<p>1</p>" },
                { id: "x", label: "X2", render: () => "<p>2</p>" },
              ],
            },
          }),
        ).toThrow(/moduleDetailTabs has duplicate id "x"/);
      });

      it("throws on duplicate journeyDetailTabs ids", () => {
        expect(() =>
          buildCatalogModel([], {
            extensions: {
              journeyDetailTabs: [
                { id: "x", label: "X", render: () => "<p>1</p>" },
                { id: "x", label: "X2", render: () => "<p>2</p>" },
              ],
            },
          }),
        ).toThrow(/journeyDetailTabs has duplicate id "x"/);
      });

      it("throws on duplicate facet keys", () => {
        expect(() =>
          buildCatalogModel([], {
            extensions: {
              facets: [
                { key: "compliance", label: "A", source: () => "x" },
                { key: "compliance", label: "B", source: () => "y" },
              ],
            },
          }),
        ).toThrow(/duplicate key "compliance"/);
      });

      it("throws on facet keys colliding with built-in URL keys", () => {
        for (const reserved of ["query", "team", "domain", "status", "tag"]) {
          expect(() =>
            buildCatalogModel([], {
              extensions: {
                facets: [{ key: reserved, label: reserved, source: () => "x" }],
              },
            }),
          ).toThrow(/collides with a built-in filter/);
        }
      });

      it("throws on facet keys with URL-unsafe characters", () => {
        expect(() =>
          buildCatalogModel([], {
            extensions: {
              facets: [{ key: "foo bar", label: "Foo Bar", source: () => "x" }],
            },
          }),
        ).toThrow(/must match.*\[a-zA-Z0-9_-\]/);
      });
    });
  });
});
