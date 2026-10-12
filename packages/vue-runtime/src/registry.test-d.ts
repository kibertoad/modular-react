import { describe, it, expectTypeOf } from "vitest";
import type { NavigationItem, RegistryPlugin, SlotMap } from "@modular-frontend/core";
import { createRegistry, type ModuleRegistry } from "./registry.js";

interface DemoRuntime {
  listDefinitions(): { id: string }[];
}
interface DemoExtension {
  registerDemo: (id: string) => void;
}

interface OtherExtension {
  registerOther: (id: number) => void;
}

function otherPlugin(): RegistryPlugin<"other", OtherExtension, { other: true }> {
  return {
    name: "other",
    extend: () => ({ registerOther: () => {} }),
    onResolve: () => ({ other: true }),
  };
}

// Same extension shape as the shipped componentPairingPlugin.
function plainPlugin(): RegistryPlugin<"plain", object, void> {
  return { name: "plain", extend: () => ({}) };
}

function demoPlugin(): RegistryPlugin<"demo", DemoExtension, DemoRuntime> {
  return {
    name: "demo",
    extend: () => ({ registerDemo: () => {} }),
    onResolve: () => ({ listDefinitions: () => [] }),
  };
}

describe("registry types", () => {
  it("intersects a plugin's extend surface onto the registry reference", () => {
    const registry = createRegistry({}).use(demoPlugin());
    expectTypeOf(registry.registerDemo).toBeFunction();
    expectTypeOf(registry.registerDemo).parameters.toEqualTypeOf<[string]>();
  });

  it("keeps every plugin's extension across chained use() calls", () => {
    const registry = createRegistry({}).use(demoPlugin()).use(otherPlugin());
    expectTypeOf(registry.registerDemo).parameters.toEqualTypeOf<[string]>();
    expectTypeOf(registry.registerOther).parameters.toEqualTypeOf<[number]>();
  });

  it("keeps the other extensions when a plugin contributes no methods", () => {
    const plainFirst = createRegistry({}).use(plainPlugin()).use(demoPlugin());
    const plainLast = createRegistry({}).use(demoPlugin()).use(plainPlugin());
    expectTypeOf(plainFirst.registerDemo).parameters.toEqualTypeOf<[string]>();
    expectTypeOf(plainLast.registerDemo).parameters.toEqualTypeOf<[string]>();
  });

  it("types the added plugin's extension on a registry with a generic plugin list", () => {
    function addOther<T extends readonly RegistryPlugin<string, any, any>[]>(
      registry: ModuleRegistry<Record<string, never>, SlotMap, NavigationItem, T>,
    ) {
      expectTypeOf(registry.use(otherPlugin()).registerOther).parameters.toEqualTypeOf<[number]>();
    }
    addOther(createRegistry({}));
  });

  it("does not widen to any on a registry with a non-tuple plugin list", () => {
    type Wide = ModuleRegistry<
      Record<string, never>,
      SlotMap,
      NavigationItem,
      readonly RegistryPlugin<string, any, any>[]
    >;
    const registry = ({} as Wide).use(demoPlugin());
    expectTypeOf(registry).not.toBeAny();
    expectTypeOf(registry.registerDemo).parameters.toEqualTypeOf<[string]>();
  });

  it("types manifest.extensions from every chained plugin", () => {
    const manifest = createRegistry({}).use(demoPlugin()).use(otherPlugin()).resolveManifest();
    expectTypeOf(manifest.extensions).toEqualTypeOf<{
      demo: DemoRuntime;
      other: { other: true };
    }>();
  });

  it("keeps plugin methods off the base registry surface", () => {
    const registry = createRegistry({});
    // @ts-expect-error registerDemo is contributed only after use(demoPlugin())
    void registry.registerDemo;
  });

  it("types the plugin runtime on manifest.journeys-style aliases via extensions", () => {
    const manifest = createRegistry({}).use(demoPlugin()).resolveManifest();
    expectTypeOf(manifest.extensions).toEqualTypeOf<{ demo: DemoRuntime }>();
  });

  it("narrows manifest.journeys to never when no journeys plugin is loaded", () => {
    const manifest = createRegistry({}).resolveManifest();
    expectTypeOf(manifest.journeys).toBeNever();
  });
});
