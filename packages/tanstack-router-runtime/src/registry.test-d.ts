import { describe, expectTypeOf, it } from "vitest";
import type { NavigationItem, RegistryPlugin, SlotMap } from "@modular-react/core";
import { createRegistry, type ModuleRegistry } from "./registry.js";

interface AlphaExtension {
  registerAlpha: (id: string) => void;
}
interface BetaExtension {
  registerBeta: (id: number) => void;
}

function alphaPlugin(): RegistryPlugin<"alpha", AlphaExtension, { alpha: true }> {
  return {
    name: "alpha",
    extend: () => ({ registerAlpha: () => {} }),
    onResolve: () => ({ alpha: true }),
  };
}

function betaPlugin(): RegistryPlugin<"beta", BetaExtension, { beta: true }> {
  return {
    name: "beta",
    extend: () => ({ registerBeta: () => {} }),
    onResolve: () => ({ beta: true }),
  };
}

// Same extension shape as the shipped componentPairingPlugin.
function plainPlugin(): RegistryPlugin<"plain", object, void> {
  return { name: "plain", extend: () => ({}) };
}

describe("registry.use types", () => {
  it("keeps every plugin's extension across chained use() calls", () => {
    const registry = createRegistry({}).use(alphaPlugin()).use(betaPlugin());
    expectTypeOf(registry.registerAlpha).parameters.toEqualTypeOf<[string]>();
    expectTypeOf(registry.registerBeta).parameters.toEqualTypeOf<[number]>();
  });

  it("keeps the other extensions when a plugin contributes no methods", () => {
    const plainFirst = createRegistry({}).use(plainPlugin()).use(alphaPlugin());
    const plainLast = createRegistry({}).use(alphaPlugin()).use(plainPlugin());
    expectTypeOf(plainFirst.registerAlpha).parameters.toEqualTypeOf<[string]>();
    expectTypeOf(plainLast.registerAlpha).parameters.toEqualTypeOf<[string]>();
  });

  it("types the added plugin's extension on a registry with a generic plugin list", () => {
    function addBeta<T extends readonly RegistryPlugin<string, any, any>[]>(
      registry: ModuleRegistry<Record<string, never>, SlotMap, NavigationItem, T>,
    ) {
      expectTypeOf(registry.use(betaPlugin()).registerBeta).parameters.toEqualTypeOf<[number]>();
    }
    addBeta(createRegistry({}));
  });

  it("does not widen to any on a registry with a non-tuple plugin list", () => {
    type Wide = ModuleRegistry<
      Record<string, never>,
      SlotMap,
      NavigationItem,
      readonly RegistryPlugin<string, any, any>[]
    >;
    const registry = ({} as Wide).use(alphaPlugin());
    expectTypeOf(registry).not.toBeAny();
    expectTypeOf(registry.registerAlpha).parameters.toEqualTypeOf<[string]>();
  });

  it("types manifest.extensions from every chained plugin", () => {
    const manifest = createRegistry({}).use(alphaPlugin()).use(betaPlugin()).resolveManifest();
    expectTypeOf(manifest.extensions).toEqualTypeOf<{
      alpha: { alpha: true };
      beta: { beta: true };
    }>();
  });
});
