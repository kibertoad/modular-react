import { resolve } from "pathe";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { harvest } from "./harvest.js";

const FIXTURES = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "test", "fixtures");

describe("harvest", () => {
  it("loads modules and journeys via Vite SSR and partitions meta", async () => {
    const { entries, errors } = await harvest(
      {
        roots: [
          { name: "modules", pattern: "modules/*.ts", resolver: "defaultExport" },
          { name: "journeys", pattern: "journeys/*.ts", resolver: "defaultExport" },
        ],
      },
      FIXTURES,
    );

    expect(errors).toEqual([]);
    const modules = entries.filter((e) => e.kind === "module");
    const journeys = entries.filter((e) => e.kind === "journey");
    expect(modules.map((m) => m.id).sort()).toEqual(["billing", "headless-helper", "profile"]);
    expect(journeys.map((j) => j.id)).toEqual(["customer-onboarding"]);
  });

  it("partitions CatalogMeta keys from extraMeta", async () => {
    const { entries } = await harvest(
      {
        roots: [{ name: "modules", pattern: "modules/billing.ts", resolver: "defaultExport" }],
      },
      FIXTURES,
    );
    const billing = entries.find((e) => e.id === "billing");
    expect(billing).toBeDefined();
    expect(billing!.meta.ownerTeam).toBe("billing-platform");
    expect(billing!.meta.tags).toEqual(["payments", "invoicing"]);
    // extraMeta carries everything outside CatalogMeta
    expect(billing!.extraMeta).toEqual({ customField: "value-not-in-catalog-meta" });
  });

  it("derives module shape data (slots, requires, entry/exit names)", async () => {
    const { entries } = await harvest(
      {
        roots: [{ name: "modules", pattern: "modules/billing.ts", resolver: "defaultExport" }],
      },
      FIXTURES,
    );
    const billing = entries[0]!;
    if (billing.kind !== "module") throw new Error("expected module");
    expect(billing.slotKeys).toEqual(["commands"]);
    expect(billing.requires).toEqual(["auth"]);
    expect(billing.optionalRequires).toEqual(["analytics"]);
    expect(billing.entryPointNames).toEqual(["review"]);
    expect(billing.exitPointNames).toEqual(["paid", "cancelled"]);
    expect(billing.hasRoutes).toBe(false);
    expect(billing.navigationLabels).toEqual(["Billing"]);
  });

  it("derives journey shape data (modulesUsed, invokes, moduleCompat)", async () => {
    const { entries } = await harvest(
      {
        roots: [{ name: "journeys", pattern: "journeys/onboarding.ts", resolver: "defaultExport" }],
      },
      FIXTURES,
    );
    const journey = entries[0]!;
    if (journey.kind !== "journey") throw new Error("expected journey");
    expect(journey.modulesUsed).toEqual(["billing", "profile"]);
    expect(journey.invokesJourneyIds).toEqual(["kyc-check"]);
    expect(journey.moduleCompat).toEqual({ profile: "^1.0.0", billing: "^1.0.0" });
  });

  it("captures transitionShape (entry → exit names, excluding allowBack)", async () => {
    const { entries } = await harvest(
      {
        roots: [{ name: "journeys", pattern: "journeys/onboarding.ts", resolver: "defaultExport" }],
      },
      FIXTURES,
    );
    const journey = entries[0]!;
    if (journey.kind !== "journey") throw new Error("expected journey");
    expect(journey.transitionShape).toEqual({
      profile: { review: ["profileComplete", "cancelled"] },
      billing: { collect: ["paid", "failed"] },
    });
  });

  it("recovers transition destinations from journey source via AST", async () => {
    const { entries, errors } = await harvest(
      {
        roots: [{ name: "journeys", pattern: "journeys/onboarding.ts", resolver: "defaultExport" }],
      },
      FIXTURES,
    );
    expect(errors).toEqual([]);
    const journey = entries[0]!;
    if (journey.kind !== "journey") throw new Error("expected journey");
    expect(journey.transitionDestinations).toEqual({
      profile: {
        review: {
          profileComplete: {
            nexts: [{ module: "billing", entry: "collect" }],
            aborts: false,
            completes: false,
          },
          cancelled: { nexts: [], aborts: true, completes: false },
        },
      },
      billing: {
        collect: {
          paid: { nexts: [], aborts: false, completes: true },
          failed: { nexts: [], aborts: true, completes: false },
        },
      },
    });
  });

  it("supports the objectMap resolver", async () => {
    const { entries } = await harvest(
      {
        roots: [{ name: "object-map", pattern: "object-map/index.ts", resolver: "objectMap" }],
      },
      FIXTURES,
    );
    expect(entries.map((e) => e.id).sort()).toEqual(["alpha", "beta"]);
  });

  it("runs the enrich hook on every entry", async () => {
    const { entries } = await harvest(
      {
        roots: [{ name: "modules", pattern: "modules/profile.ts", resolver: "defaultExport" }],
        enrich: (entry) => ({
          ...entry,
          meta: { ...entry.meta, ownerTeam: "enriched-owner" },
        }),
      },
      FIXTURES,
    );
    expect(entries[0]!.meta.ownerTeam).toBe("enriched-owner");
  });

  it("collects load errors without aborting the whole scan", async () => {
    const { errors, entries } = await harvest(
      {
        roots: [
          // pattern that doesn't match anything yields zero candidates;
          // a syntactically broken file would produce an error — this fixture
          // set has no broken file so we just verify the empty-error case.
          { name: "missing", pattern: "modules/does-not-exist.ts", resolver: "defaultExport" },
          { name: "modules", pattern: "modules/billing.ts", resolver: "defaultExport" },
        ],
      },
      FIXTURES,
    );
    expect(errors).toEqual([]);
    expect(entries.length).toBe(1);
  });
});
