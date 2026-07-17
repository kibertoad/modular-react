import { describe, it, expectTypeOf } from "vitest";
import type { RegistryPlugin } from "@modular-frontend/core";
import { createRegistry } from "./registry.js";

interface DemoRuntime {
  listDefinitions(): { id: string }[];
}
interface DemoExtension {
  registerDemo: (id: string) => void;
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
