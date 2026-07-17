import { describe, it, expectTypeOf } from "vitest";
import type { NavigationItem } from "@modular-frontend/core";
import type { Route } from "@angular/router";
import { defineModule } from "./define-module.js";
import type { AnyModuleDescriptor, LazyModuleDescriptor, ModuleDescriptor } from "./types.js";

describe("defineModule typing", () => {
  it("narrows createRoutes to Angular Router Route(s)", () => {
    const mod = defineModule({
      id: "billing",
      version: "1.0.0",
      createRoutes: (): Route[] => [{ path: "billing" }],
    });

    // `defineModule` now preserves the descriptor's *literal* shape (so a
    // journey can read its entry/exit vocabulary off `typeof mod`), which means
    // `createRoutes` keeps its authored signature rather than widening to the
    // base `(() => Route | Route[]) | undefined`. It must still be assignable
    // to the Angular-narrowed base signature.
    expectTypeOf(mod.createRoutes).toExtend<(() => Route | Route[]) | undefined>();
  });

  it("accepts a single route, not just an array", () => {
    const mod = defineModule({
      id: "billing",
      version: "1.0.0",
      createRoutes: (): Route => ({ path: "billing" }),
    });

    expectTypeOf(mod.createRoutes).not.toBeUndefined();
  });

  it("preserves the descriptor generics on the return type", () => {
    interface AppDeps {
      auth: { user: string | null };
    }
    interface AppSlots {
      commands: { id: string }[];
    }

    const mod = defineModule<AppDeps, AppSlots>({
      id: "billing",
      version: "1.0.0",
    });

    // `defineModule` now returns the *inferred literal* rather than the widened
    // `ModuleDescriptor<AppDeps, AppSlots>` — that is what lets a journey read
    // a module's literal entry/exit vocabulary off `typeof mod`. The explicit
    // `<AppDeps, AppSlots>` generics still constrain the argument, so the result
    // stays assignable to the descriptor over the same deps/slots.
    const asBase: ModuleDescriptor<AppDeps, AppSlots> = mod;
    void asBase;
  });

  it("passes typed i18n-label keys through navigation items", () => {
    type NavKey = "nav.home" | "nav.billing";
    type AppNavItem = NavigationItem<NavKey>;

    const mod = defineModule<
      Record<string, any>,
      Record<string, never>,
      Record<string, unknown>,
      AppNavItem
    >({
      id: "billing",
      version: "1.0.0",
      navigation: [{ label: "nav.billing", to: "/billing" }],
    });

    expectTypeOf(mod.navigation).toEqualTypeOf<readonly AppNavItem[] | undefined>();
    expectTypeOf(mod.navigation).items.toHaveProperty("label").toEqualTypeOf<NavKey>();
  });

  it("passes a typed nav meta bag through", () => {
    interface NavMeta {
      action?: "manageThings" | "createThings";
    }
    type AppNavItem = NavigationItem<string, void, NavMeta>;

    const mod = defineModule<
      Record<string, any>,
      Record<string, never>,
      Record<string, unknown>,
      AppNavItem
    >({
      id: "billing",
      version: "1.0.0",
      navigation: [{ label: "Billing", to: "/billing", meta: { action: "manageThings" } }],
    });

    expectTypeOf(mod.navigation).items.toHaveProperty("meta").toEqualTypeOf<NavMeta | undefined>();
  });
});

describe("AnyModuleDescriptor", () => {
  it("accepts a concrete descriptor regardless of deps/slots", () => {
    interface AppDeps {
      auth: { user: string | null };
    }
    interface AppSlots {
      commands: { id: string }[];
    }

    const mod: ModuleDescriptor<AppDeps, AppSlots> = {
      id: "billing",
      version: "1.0.0",
      createRoutes: () => ({ path: "billing" }),
    };

    expectTypeOf(mod).toMatchTypeOf<AnyModuleDescriptor>();
  });
});

describe("LazyModuleDescriptor", () => {
  it("loads to a module whose default is the Angular Router descriptor", () => {
    const lazy: LazyModuleDescriptor = {
      id: "billing",
      basePath: "/billing",
      load: () =>
        Promise.resolve({
          default: {
            id: "billing",
            version: "1.0.0",
            createRoutes: () => ({ path: "billing" }),
          },
        }),
    };

    expectTypeOf(lazy.load)
      .returns.resolves.toHaveProperty("default")
      .toMatchTypeOf<ModuleDescriptor>();
  });
});
