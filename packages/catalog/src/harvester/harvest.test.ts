import { resolve } from "pathe";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildResolve, harvest } from "./harvest.js";

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
      billing: { review: ["paid", "cancelled"] },
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
            nexts: [{ module: "billing", entry: "review" }],
            aborts: false,
            completes: false,
          },
          cancelled: { nexts: [], aborts: true, completes: false },
        },
      },
      billing: {
        review: {
          paid: { nexts: [], aborts: false, completes: true },
          cancelled: { nexts: [], aborts: true, completes: false },
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

  it("resolves imports through a configured path alias (object form, relative replacement)", async () => {
    const { entries, errors } = await harvest(
      {
        roots: [{ name: "aliased", pattern: "aliased/modules/*.ts", resolver: "defaultExport" }],
        // Relative replacement is anchored to the config dir (FIXTURES).
        resolve: { alias: { "@shared": "./aliased/shared" } },
      },
      FIXTURES,
    );

    expect(errors).toEqual([]);
    const aliased = entries.find((e) => e.id === "aliased");
    expect(aliased).toBeDefined();
    // ownerTeam comes from the value imported through `@shared`, proving the
    // alias resolved at load time rather than being type-erased.
    expect(aliased!.meta.ownerTeam).toBe("platform-team");
  });

  it("accepts the array form with a RegExp find and an absolute replacement", async () => {
    const { entries, errors } = await harvest(
      {
        roots: [{ name: "aliased", pattern: "aliased/modules/*.ts", resolver: "defaultExport" }],
        resolve: {
          alias: [{ find: /^@shared\//, replacement: `${resolve(FIXTURES, "aliased/shared")}/` }],
        },
      },
      FIXTURES,
    );

    expect(errors).toEqual([]);
    expect(entries.map((e) => e.id)).toEqual(["aliased"]);
  });

  it("reports an aliased import as a non-fatal load error when no alias is configured", async () => {
    const { entries, errors } = await harvest(
      {
        roots: [{ name: "aliased", pattern: "aliased/modules/*.ts", resolver: "defaultExport" }],
      },
      FIXTURES,
    );

    expect(entries).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("@shared/meta");
  });

  it("collects load errors without aborting the whole scan", async () => {
    const { errors, entries } = await harvest(
      {
        roots: [
          { name: "broken", pattern: "broken-modules/broken.ts", resolver: "defaultExport" },
          { name: "modules", pattern: "modules/billing.ts", resolver: "defaultExport" },
        ],
      },
      FIXTURES,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.filePath).toContain("broken.ts");
    expect(errors[0]!.message).toContain("broken fixture load failure");
    expect(entries.length).toBe(1);
  });
});

describe("buildResolve", () => {
  const CWD = "/project";

  it("returns an empty object when no resolve config is given", () => {
    expect(buildResolve(CWD)).toEqual({});
  });

  it("forwards dedupe verbatim into the resolve slice", () => {
    expect(buildResolve(CWD, { dedupe: ["react", "react-dom"] })).toEqual({
      resolve: { dedupe: ["react", "react-dom"] },
    });
  });

  it("anchors `.`-prefixed alias replacements to the config dir and passes others through", () => {
    const result = buildResolve(CWD, {
      alias: {
        "@ui": "./packages/ui/src", // relative → anchored
        react: "preact/compat", // bare specifier → unchanged
        "@abs": "/already/absolute", // absolute → unchanged
      },
    });

    expect(result).toEqual({
      resolve: {
        alias: [
          { find: "@ui", replacement: resolve(CWD, "./packages/ui/src") },
          { find: "react", replacement: "preact/compat" },
          { find: "@abs", replacement: "/already/absolute" },
        ],
      },
    });
  });

  it("preserves a RegExp find from the array form", () => {
    const result = buildResolve(CWD, {
      alias: [{ find: /^@app\//, replacement: "/abs/src/" }],
    });

    expect(result).toEqual({
      resolve: { alias: [{ find: /^@app\//, replacement: "/abs/src/" }] },
    });
  });
});
