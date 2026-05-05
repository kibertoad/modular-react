import type { ComponentType } from "react";
import { describe, expectTypeOf, test } from "vitest";
import type { StaticDataRouteOption } from "@tanstack/react-router";
import { defineShellStaticData } from "./shell-static-data.js";

// ---- Two-tier augmentation, mirroring the documented pattern ----
//
// `AppPageZones` keys flow through the augmentation, so every route may
// declare them. `AppShellZones` keys are deliberately excluded — only
// routes that route their staticData through `defineShellStaticData` may
// set them. `AppShellMixedData` is included to verify that the helper's
// `extends object` constraint accepts non-component fields too (the
// pattern extends to `useRouteData`-style metadata).
interface AppPageZones {
  detailPanel?: ComponentType;
}

interface AppShellZones {
  HeaderTitle?: ComponentType;
  HeaderActions?: ComponentType;
}

interface AppShellMixedData {
  HeaderTitle?: ComponentType;
  headerVariant?: "portal" | "project";
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption extends AppPageZones {}
}

const TitleComponent: ComponentType = () => null;
const ActionsComponent: ComponentType = () => null;
const PanelComponent: ComponentType = () => null;

describe("defineShellStaticData — type contract", () => {
  test("returns a value assignable to StaticDataRouteOption", () => {
    const result = defineShellStaticData<AppShellZones>({
      HeaderTitle: TitleComponent,
    });
    expectTypeOf(result).toEqualTypeOf<StaticDataRouteOption>();
  });

  test("accepts the union of shell-owned and page-contributable zones", () => {
    const result = defineShellStaticData<AppShellZones & AppPageZones>({
      HeaderTitle: TitleComponent,
      HeaderActions: ActionsComponent,
      detailPanel: PanelComponent,
    });
    expectTypeOf(result).toEqualTypeOf<StaticDataRouteOption>();
  });

  test("accepts mixed component and non-component shell-owned shapes", () => {
    // The helper is intentionally `extends object`, not `ZoneMapOf`, so
    // shell-owned route data fields (headerVariant enums, page titles)
    // can flow through the same audit point as component zones. The
    // gating still works — `AppShellMixedData` keys aren't in
    // `StaticDataRouteOption` either way.
    const result = defineShellStaticData<AppShellMixedData>({
      HeaderTitle: TitleComponent,
      headerVariant: "project",
    });
    expectTypeOf(result).toEqualTypeOf<StaticDataRouteOption>();
  });

  test("rejects values that don't match the declared shell shape", () => {
    defineShellStaticData<AppShellMixedData>({
      HeaderTitle: TitleComponent,
      // @ts-expect-error – "wide" is not a valid headerVariant
      headerVariant: "wide",
    });

    defineShellStaticData<AppShellZones>({
      // @ts-expect-error – HeaderTitle expects ComponentType, not string
      HeaderTitle: "not a component",
    });
  });
});

describe("Two-tier augmentation: descendants cannot write shell-owned keys", () => {
  // The augmentation only extends `StaticDataRouteOption` with
  // `AppPageZones`, so an object literal targeting that type rejects
  // shell-owned keys via TS object-literal excess-property checking.

  test("page-contributable keys are accepted on a plain staticData literal", () => {
    const ok: StaticDataRouteOption = {
      detailPanel: PanelComponent,
    };
    expectTypeOf(ok).toEqualTypeOf<StaticDataRouteOption>();
  });

  test("shell-owned keys are rejected on a plain staticData literal", () => {
    const _bad: StaticDataRouteOption = {
      // @ts-expect-error – HeaderTitle is not in StaticDataRouteOption
      HeaderTitle: TitleComponent,
    };
    void _bad;
  });

  test("the shell-route escape hatch produces an assignable value", () => {
    const ok: StaticDataRouteOption = defineShellStaticData<AppShellZones & AppPageZones>({
      HeaderTitle: TitleComponent,
      detailPanel: PanelComponent,
    });
    expectTypeOf(ok).toEqualTypeOf<StaticDataRouteOption>();
  });
});
