import { describe, it, expectTypeOf } from "vitest";
import type { ModuleRouteData } from "./route-data.js";

describe("ModuleRouteData typing", () => {
  // Zone values are components; the runtime renders them in named regions.
  interface AppZones {
    detailPanel?: () => unknown;
    headerActions?: () => unknown;
  }

  it("types named zone keys with their component type, kept optional", () => {
    const data: ModuleRouteData<AppZones> = {};
    expectTypeOf(data.detailPanel).toEqualTypeOf<(() => unknown) | undefined>();
  });

  it("still allows arbitrary route-data keys alongside the zones", () => {
    const data: ModuleRouteData<AppZones> = {
      detailPanel: () => null,
      breadcrumb: "Billing",
      requiresAuth: true,
    };

    expectTypeOf(data).toMatchTypeOf<Record<string, unknown>>();
    // An undeclared key falls through to the arbitrary-data index signature.
    expectTypeOf(data.breadcrumb).toEqualTypeOf<unknown>();
  });

  it("defaults to a plain arbitrary-data bag when no zone map is given", () => {
    const data: ModuleRouteData = { anything: 1, goesHere: "yes" };
    expectTypeOf(data).toMatchTypeOf<Record<string, unknown>>();
  });
});
