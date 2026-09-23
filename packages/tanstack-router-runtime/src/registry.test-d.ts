import { describe, expectTypeOf, it } from "vitest";
import type { RegistryPlugin } from "@modular-react/core";
import { createRegistry } from "./registry.js";

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

describe("registry.use types", () => {
  it("keeps every plugin's extension across chained use() calls", () => {
    const registry = createRegistry({}).use(alphaPlugin()).use(betaPlugin());
    expectTypeOf(registry.registerAlpha).parameters.toEqualTypeOf<[string]>();
    expectTypeOf(registry.registerBeta).parameters.toEqualTypeOf<[number]>();
  });

  it("types manifest.extensions from every chained plugin", () => {
    const manifest = createRegistry({}).use(alphaPlugin()).use(betaPlugin()).resolveManifest();
    expectTypeOf(manifest.extensions).toEqualTypeOf<{
      alpha: { alpha: true };
      beta: { beta: true };
    }>();
  });
});
