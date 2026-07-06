import { describe, it, expect } from "vitest";
import * as core from "./index.js";

// The composables and scoped store are re-exported from @modular-vue/vue and
// the detection helpers from @modular-frontend/core; their behavior is tested
// in those packages. This suite only asserts the re-export wiring resolves, so
// a broken barrel is caught here rather than downstream.
describe("@vue-router-modules/core public surface", () => {
  it("re-exports the module-definition helpers", () => {
    expect(core.defineModule).toBeTypeOf("function");
    expect(core.defineSlots).toBeTypeOf("function");

    const mod = core.defineModule({ id: "billing", version: "1.0.0" });
    expect(mod.id).toBe("billing");
  });

  it("re-exports the framework-neutral detection helpers", () => {
    expect(core.isStoreApi).toBeTypeOf("function");
    expect(core.isReactiveService).toBeTypeOf("function");
    expect(core.separateDeps).toBeTypeOf("function");
  });

  it("re-exports the Vue binding's shared composables and scoped store", () => {
    expect(core.createSharedComposables).toBeTypeOf("function");
    expect(core.provideSharedDependencies).toBeTypeOf("function");
    expect(core.sharedDependenciesKey).toBeDefined();
    expect(core.createScopedStore).toBeTypeOf("function");

    const scoped = core.createScopedStore<{ n: number }>(() => ({ n: 0 }));
    expect(scoped.getOrCreate("a").getState()).toEqual({ n: 0 });
  });
});
