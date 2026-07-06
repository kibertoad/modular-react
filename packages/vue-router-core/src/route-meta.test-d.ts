import { describe, it, expectTypeOf } from "vitest";
import type { ModuleRouteMeta } from "./route-meta.js";

describe("ModuleRouteMeta typing", () => {
  // Zone values are components; the runtime renders them in named regions.
  interface AppZones {
    detailPanel?: () => unknown;
    headerActions?: () => unknown;
  }

  it("types named zone keys with their component type, kept optional", () => {
    const meta: ModuleRouteMeta<AppZones> = {};
    expectTypeOf(meta.detailPanel).toEqualTypeOf<(() => unknown) | undefined>();
  });

  it("still allows arbitrary route-data keys alongside the zones", () => {
    const meta: ModuleRouteMeta<AppZones> = {
      detailPanel: () => null,
      breadcrumb: "Billing",
      requiresAuth: true,
    };

    expectTypeOf(meta).toMatchTypeOf<Record<string, unknown>>();
    // An undeclared key falls through to the arbitrary-data index signature.
    expectTypeOf(meta.breadcrumb).toEqualTypeOf<unknown>();
  });

  it("defaults to a plain arbitrary-data bag when no zone map is given", () => {
    const meta: ModuleRouteMeta = { anything: 1, goesHere: "yes" };
    expectTypeOf(meta).toMatchTypeOf<Record<string, unknown>>();
  });
});
