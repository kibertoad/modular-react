import { describe, it, expect } from "vitest";
import * as core from "./index.js";

// The injectors and scoped store are re-exported from @modular-angular/angular
// and the detection helpers from @modular-frontend/core; their behavior is
// tested in those packages. This suite only asserts the re-export wiring
// resolves, so a broken barrel is caught here rather than downstream.
describe("@angular-router-modules/core public surface", () => {
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

  it("re-exports the Angular binding's shared injectors and scoped store", () => {
    expect(core.createSharedInjectors).toBeTypeOf("function");
    expect(core.provideSharedDependencies).toBeTypeOf("function");
    expect(core.SHARED_DEPENDENCIES).toBeDefined();
    expect(core.createScopedStore).toBeTypeOf("function");

    const scoped = core.createScopedStore<{ n: number }>(() => ({ n: 0 }));
    expect(scoped.getOrCreate("a").getState()).toEqual({ n: 0 });
  });
});
