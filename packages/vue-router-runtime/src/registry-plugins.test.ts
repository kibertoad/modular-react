import { describe, it, expect } from "vitest";
import type { NavigationItemBase, RegistryPlugin } from "@modular-frontend/core";
import { createRegistry } from "./registry.js";

// The Vue journeys plugin lands in PR-30 / PR-32; until then the registry's
// plugin machinery (extend / validate / contributeNavigation / onResolve, the
// `.extensions` bag, and the `.journeys` alias) is exercised with a synthetic
// journeys-shaped plugin. It mirrors the React `journeysPlugin` surface the
// real one will provide: a `registerJourney` method, journey-launcher nav
// items, and a runtime exposed on `manifest.journeys`.

interface JourneyNav {
  label: string;
  order?: number;
  group?: string;
  hidden?: boolean;
  buildInput?: () => unknown;
}
interface JourneyDef {
  id: string;
}
interface JourneysRuntime {
  listDefinitions(): { id: string }[];
}
interface JourneysExtension {
  registerJourney: (def: JourneyDef, options?: { nav?: JourneyNav }) => void;
}

function journeysLikePlugin(
  opts: { failValidationWith?: string } = {},
): RegistryPlugin<"journeys", JourneysExtension, JourneysRuntime> {
  const registered: { def: JourneyDef; nav?: JourneyNav }[] = [];
  return {
    name: "journeys",
    extend() {
      return {
        registerJourney(def, options) {
          if (!def.id) {
            throw new Error("[test] Invalid journey registration: id is required");
          }
          registered.push({ def, nav: options?.nav });
        },
      };
    },
    validate() {
      if (opts.failValidationWith) {
        throw new Error(`unknown module id "${opts.failValidationWith}"`);
      }
    },
    contributeNavigation() {
      return registered
        .filter((j): j is { def: JourneyDef; nav: JourneyNav } => j.nav != null)
        .map(
          (j): NavigationItemBase => ({
            label: j.nav.label,
            to: "",
            order: j.nav.order,
            group: j.nav.group,
            hidden: j.nav.hidden,
            action: { kind: "journey-start", journeyId: j.def.id, buildInput: j.nav.buildInput },
          }),
        );
    },
    onResolve() {
      return {
        listDefinitions: () => registered.map((j) => ({ id: j.def.id })),
      };
    },
  };
}

const moduleA: JourneyDef & { version: string } = { id: "a", version: "1.0.0" };

describe("registry plugin machinery", () => {
  it("exposes manifest.journeys and the extensions bag when a plugin contributes a runtime", () => {
    const registry = createRegistry({}).use(journeysLikePlugin());
    registry.register(moduleA);
    registry.registerJourney({ id: "demo" });

    const manifest = registry.resolveManifest();

    expect(manifest.journeys.listDefinitions()).toEqual([{ id: "demo" }]);
    expect(manifest.extensions.journeys).toBe(manifest.journeys);
    expect(manifest.moduleDescriptors.a).toBe(moduleA);
  });

  it("registerJourney is unavailable without the plugin, and extensions is empty", () => {
    const registry = createRegistry({});
    registry.register(moduleA);
    const manifest = registry.resolveManifest();
    // @ts-expect-error registerJourney is not part of the base registry type
    expect(registry.registerJourney).toBeUndefined();
    expect(manifest.extensions).toEqual({});
  });

  it("aggregates plugin validation errors at resolveManifest time", () => {
    const registry = createRegistry({}).use(journeysLikePlugin({ failValidationWith: "ghost" }));
    registry.register(moduleA);
    registry.registerJourney({ id: "demo" });
    expect(() => registry.resolveManifest()).toThrow(/unknown module id "ghost"/);
  });

  it("surfaces errors thrown by a plugin's extend-contributed method", () => {
    const registry = createRegistry({}).use(journeysLikePlugin());
    registry.register(moduleA);
    expect(() => registry.registerJourney({ id: "" })).toThrow(/Invalid journey registration/);
  });

  it("throws on a duplicate plugin name", () => {
    const registry = createRegistry({}).use(journeysLikePlugin());
    expect(() => registry.use(journeysLikePlugin())).toThrow(/Duplicate plugin name "journeys"/);
  });

  it("throws when a plugin tries to overwrite a registry method", () => {
    const collidingPlugin: RegistryPlugin<"collision", { register: () => void }, undefined> = {
      name: "collision",
      extend: () => ({ register: () => {} }),
    };
    const registry = createRegistry({});
    expect(() => registry.use(collidingPlugin)).toThrow(
      /attempted to overwrite registry method "register"/,
    );
  });

  it("prevents use() after resolveManifest", () => {
    const registry = createRegistry({});
    registry.register(moduleA);
    registry.resolveManifest();
    expect(() => registry.use(journeysLikePlugin())).toThrow(
      /Cannot register modules after resolveManifest/,
    );
  });

  it("accepts a plugin method whose name is inherited from Object.prototype", () => {
    // The collision guard must compare against the registry's own methods, not
    // names like `toString` / `hasOwnProperty` inherited from Object.prototype —
    // no registry method owns those, so contributing one must not be rejected.
    const protoPlugin: RegistryPlugin<"proto", { toString: () => string }, undefined> = {
      name: "proto",
      extend: () => ({ toString: () => "custom" }),
    };
    const registry = createRegistry({});
    expect(() => registry.use(protoPlugin)).not.toThrow();
    expect((registry as unknown as { toString: () => string }).toString()).toBe("custom");
  });
});

describe("plugin-contributed navigation", () => {
  it("emits a nav item for each journey registered with a nav block", () => {
    const registry = createRegistry({}).use(journeysLikePlugin());
    registry.register(moduleA);
    registry.registerJourney(
      { id: "demo" },
      {
        nav: {
          label: "Start demo",
          group: "workflows",
          order: 10,
          buildInput: () => ({ id: "seed" }),
        },
      },
    );
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
    expect((item.action.buildInput as () => unknown)()).toEqual({ id: "seed" });
  });

  it("journeys without a nav block contribute nothing", () => {
    const registry = createRegistry({}).use(journeysLikePlugin());
    registry.register(moduleA);
    registry.registerJourney({ id: "demo" });
    const manifest = registry.resolveManifest();
    expect(manifest.navigation.items).toHaveLength(0);
  });

  it("module-contributed nav and plugin-contributed nav coexist and sort together", () => {
    const modWithNav = {
      id: "home",
      version: "1.0.0",
      navigation: [{ label: "Home", to: "/", order: 1 }],
    };
    const registry = createRegistry({}).use(journeysLikePlugin());
    registry.register(moduleA);
    registry.register(modWithNav);
    registry.registerJourney({ id: "demo" }, { nav: { label: "Start demo", order: 2 } });
    const manifest = registry.resolveManifest();
    expect(manifest.navigation.items.map((i) => i.label)).toEqual(["Home", "Start demo"]);
  });

  it("hidden contributions still land in manifest.items (shell may still filter them)", () => {
    const registry = createRegistry({}).use(journeysLikePlugin());
    registry.register(moduleA);
    registry.registerJourney({ id: "demo" }, { nav: { label: "Hidden launcher", hidden: true } });
    const manifest = registry.resolveManifest();
    expect(manifest.navigation.items).toHaveLength(1);
    expect(manifest.navigation.items[0].hidden).toBe(true);
  });
});
