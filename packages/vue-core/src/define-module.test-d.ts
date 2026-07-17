import { describe, it, expectTypeOf } from "vitest";
import type { NavigationItem } from "@modular-frontend/core";
import type { RouteRecordRaw } from "vue-router";
import { defineModule } from "./define-module.js";
import type { AnyModuleDescriptor, LazyModuleDescriptor, ModuleDescriptor } from "./types.js";

describe("defineModule typing", () => {
  it("narrows createRoutes to vue-router RouteRecordRaw(s)", () => {
    const mod = defineModule({
      id: "billing",
      version: "1.0.0",
      createRoutes: (): RouteRecordRaw[] => [{ path: "/billing", component: {} }],
    });

    // `defineModule` preserves the descriptor's *literal* shape (so journeys can
    // read entry/exit vocabulary off `typeof mod`); `createRoutes` therefore
    // keeps its authored signature rather than widening to the base union, but
    // must remain assignable to the vue-router-narrowed base signature.
    expectTypeOf(mod.createRoutes).toExtend<
      (() => RouteRecordRaw | RouteRecordRaw[]) | undefined
    >();
  });

  it("accepts a single route record, not just an array", () => {
    const mod = defineModule({
      id: "billing",
      version: "1.0.0",
      createRoutes: (): RouteRecordRaw => ({ path: "/billing", component: {} }),
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

    // Returns the inferred literal rather than the widened descriptor (that is
    // what lets a journey read a module's literal entry/exit vocabulary off
    // `typeof mod`); the explicit `<AppDeps, AppSlots>` generics still constrain
    // the argument, so the result stays assignable to the descriptor over the
    // same deps/slots.
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
      createRoutes: () => ({ path: "/billing", component: {} }),
    };

    expectTypeOf(mod).toMatchTypeOf<AnyModuleDescriptor>();
  });
});

describe("LazyModuleDescriptor", () => {
  it("loads to a module whose default is the vue-router descriptor", () => {
    const lazy: LazyModuleDescriptor = {
      id: "billing",
      basePath: "/billing",
      load: () =>
        Promise.resolve({
          default: {
            id: "billing",
            version: "1.0.0",
            createRoutes: () => ({ path: "/billing", component: {} }),
          },
        }),
    };

    expectTypeOf(lazy.load)
      .returns.resolves.toHaveProperty("default")
      .toMatchTypeOf<ModuleDescriptor>();
  });
});
