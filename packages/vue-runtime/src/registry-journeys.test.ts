import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, schema } from "@modular-frontend/core";
import { defineModule } from "@modular-vue/core";
import { defineJourney, journeysPlugin } from "@modular-vue/journeys";
import { createRegistry } from "./registry.js";

// PR-32: the real `@modular-vue/journeys` plugin wired end-to-end into the
// registry. This replaces the synthetic journeys-shaped plugin that
// `registry-plugins.test.ts` used to prove the generic plugin machinery — those
// generic edge cases (name collision, Object.prototype method names, method
// overwrite) still live there; here we assert the concrete journeys plugin
// contributes `registerJourney`, a `JourneyRuntime` on `manifest.journeys`, and
// launcher nav items. The Vue analog of
// `react-router-runtime/src/registry-journeys.test.ts`.

const aExits = { go: defineExit<{ amount: number }>(), done: defineExit() } as const;
const moduleA = defineModule({
  id: "a",
  version: "1.0.0",
  exitPoints: aExits,
  entryPoints: {
    review: defineEntry({ component: (() => null) as never, input: schema<{ id: string }>() }),
  },
});

type Modules = { readonly a: typeof moduleA };

const journey = defineJourney<Modules, { id: string }>()({
  id: "demo",
  version: "1.0.0",
  initialState: ({ id }: { id: string }) => ({ id }),
  start: (s) => ({ module: "a", entry: "review", input: { id: s.id } }),
  transitions: {
    a: { review: { go: () => ({ complete: null }), done: () => ({ complete: null }) } },
  },
});

describe("registry.registerJourney + resolveManifest", () => {
  it("exposes manifest.journeys when at least one is registered", () => {
    const registry = createRegistry({}).use(journeysPlugin());
    registry.register(moduleA);
    registry.registerJourney(journey);
    const manifest = registry.resolveManifest();
    expect(manifest.journeys.listDefinitions()).toEqual([
      { id: "demo", version: "1.0.0", meta: undefined },
    ]);
    expect(manifest.extensions.journeys).toBe(manifest.journeys);
    expect(manifest.moduleDescriptors.a).toBe(moduleA);
  });

  it("registerJourney is unavailable without the journeys plugin", () => {
    const registry = createRegistry({});
    registry.register(moduleA);
    const manifest = registry.resolveManifest();
    // @ts-expect-error registerJourney is not part of the base registry type
    expect(registry.registerJourney).toBeUndefined();
    expect(manifest.extensions).toEqual({});
  });

  it("manifest.journeys is a no-op runtime when the plugin is loaded with no journey", () => {
    const registry = createRegistry({}).use(journeysPlugin());
    registry.register(moduleA);
    const manifest = registry.resolveManifest();
    expect(manifest.journeys.listDefinitions()).toEqual([]);
    expect(manifest.journeys.listInstances()).toEqual([]);
    // start() still throws "unknown journey id" as it would on a
    // non-registered definition — same failure mode, no null-check needed.
    expect(() => manifest.journeys.start("nope", {})).toThrow(/Unknown journey id/);
  });

  it("aggregates validation errors at resolveManifest time", () => {
    const registry = createRegistry({}).use(journeysPlugin());
    registry.register(moduleA);
    const bad = {
      ...journey,
      id: "bad",
      transitions: { ghost: { review: { go: () => ({ complete: null }) } } as never },
    } as typeof journey;
    registry.registerJourney(bad);
    expect(() => registry.resolveManifest()).toThrow(/unknown module id "ghost"/);
  });

  it("forwards onModuleExit on the manifest", () => {
    const registry = createRegistry({}).use(journeysPlugin());
    registry.register(moduleA);
    const onModuleExit = () => {};
    const manifest = registry.resolveManifest({ onModuleExit });
    expect(manifest.onModuleExit).toBe(onModuleExit);
  });

  it("throws at registerJourney time on a structurally invalid definition", () => {
    const registry = createRegistry({}).use(journeysPlugin());
    registry.register(moduleA);
    const malformed = { ...journey, id: "", transitions: undefined };
    expect(() => registry.registerJourney(malformed as never)).toThrow(
      /Invalid journey registration/,
    );
  });
});

describe("journey-contributed navigation", () => {
  it("emits a nav item for each journey registered with a nav block", () => {
    const registry = createRegistry({}).use(journeysPlugin());
    registry.register(moduleA);
    registry.registerJourney(journey, {
      nav: {
        label: "Start demo",
        group: "workflows",
        order: 10,
        buildInput: () => ({ id: "seed" }),
      },
    });
    const manifest = registry.resolveManifest();
    expect(manifest.navigation.items).toHaveLength(1);
    const item = manifest.navigation.items[0] as (typeof manifest.navigation.items)[number] & {
      action: { kind: string; journeyId: string; buildInput?: () => unknown };
    };
    expect(item.label).toBe("Start demo");
    expect(item.to).toBe("");
    expect(item.group).toBe("workflows");
    expect(item.order).toBe(10);
    expect(item.action.kind).toBe("journey-start");
    expect(item.action.journeyId).toBe("demo");
    expect(typeof item.action.buildInput).toBe("function");
    expect((item.action.buildInput as () => unknown)()).toEqual({ id: "seed" });
  });

  it("journeys without a nav block contribute nothing", () => {
    const registry = createRegistry({}).use(journeysPlugin());
    registry.register(moduleA);
    registry.registerJourney(journey);
    const manifest = registry.resolveManifest();
    expect(manifest.navigation.items).toHaveLength(0);
  });

  it("module-contributed nav and journey-contributed nav coexist and sort together", () => {
    const modWithNav = defineModule({
      id: "home",
      version: "1.0.0",
      navigation: [{ label: "Home", to: "/", order: 1 }],
    });
    const registry = createRegistry({}).use(journeysPlugin());
    registry.register(moduleA);
    registry.register(modWithNav);
    registry.registerJourney(journey, { nav: { label: "Start demo", order: 2 } });
    const manifest = registry.resolveManifest();
    expect(manifest.navigation.items.map((i) => i.label)).toEqual(["Home", "Start demo"]);
  });

  it("buildNavItem adapter reshapes the default item into the app's narrowed TNavItem", () => {
    const registry = createRegistry({}).use(
      journeysPlugin({
        buildNavItem: (defaults, raw) => ({
          ...defaults,
          meta: { analytics: `launch-${raw.journeyId}` },
        }),
      }),
    );
    registry.register(moduleA);
    registry.registerJourney(journey, {
      nav: { label: "Start demo" },
    });
    const manifest = registry.resolveManifest();
    expect(manifest.navigation.items).toHaveLength(1);
    const item = manifest.navigation.items[0] as (typeof manifest.navigation.items)[number] & {
      meta: { analytics: string };
    };
    expect(item.meta.analytics).toBe("launch-demo");
  });

  it("hidden contributions still land in manifest.items (shell may still filter them)", () => {
    const registry = createRegistry({}).use(journeysPlugin());
    registry.register(moduleA);
    registry.registerJourney(journey, {
      nav: { label: "Hidden launcher", hidden: true },
    });
    const manifest = registry.resolveManifest();
    expect(manifest.navigation.items).toHaveLength(1);
    expect(manifest.navigation.items[0].hidden).toBe(true);
  });
});
