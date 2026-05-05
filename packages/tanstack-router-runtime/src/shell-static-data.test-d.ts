import type { ComponentType } from "react";
import { describe, expectTypeOf, test } from "vitest";
import type { StaticDataRouteOption } from "@tanstack/react-router";
import { defineShellStaticData } from "./shell-static-data.js";

// ---- Two-tier augmentation, mirroring the documented pattern ----
//
// `AppPageStaticData` keys flow through the augmentation, so every
// route may declare them. `AppShellStaticData` keys are deliberately
// excluded — only routes that route their staticData through
// `defineShellStaticData` may set them.
interface AppPageStaticData {
  detailPanel?: ComponentType;
  pageTitle?: string;
}

interface AppShellStaticData {
  HeaderTitle?: ComponentType;
  HeaderActions?: ComponentType;
  headerVariant?: "portal" | "project";
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption extends AppPageStaticData {}
}

const TitleComponent: ComponentType = () => null;
const ActionsComponent: ComponentType = () => null;
const PanelComponent: ComponentType = () => null;

describe("defineShellStaticData — type contract", () => {
  test("returns a value assignable to StaticDataRouteOption", () => {
    const result = defineShellStaticData<AppShellStaticData>({
      HeaderTitle: TitleComponent,
    });
    expectTypeOf(result).toEqualTypeOf<StaticDataRouteOption>();
  });

  test("accepts the union of shell-owned and page-contributable shapes", () => {
    const result = defineShellStaticData<AppShellStaticData & AppPageStaticData>({
      HeaderTitle: TitleComponent,
      HeaderActions: ActionsComponent,
      detailPanel: PanelComponent,
      pageTitle: "Project",
    });
    expectTypeOf(result).toEqualTypeOf<StaticDataRouteOption>();
  });

  test("rejects values that don't match the declared shell shape", () => {
    defineShellStaticData<AppShellStaticData>({
      HeaderTitle: TitleComponent,
      // @ts-expect-error – "wide" is not a valid headerVariant
      headerVariant: "wide",
    });

    defineShellStaticData<AppShellStaticData>({
      // @ts-expect-error – HeaderTitle expects ComponentType, not string
      HeaderTitle: "not a component",
    });
  });
});

describe("Two-tier augmentation: descendants cannot write shell-owned keys", () => {
  // The augmentation only extends `StaticDataRouteOption` with
  // `AppPageStaticData`, so an object literal targeting that type rejects
  // shell-owned keys via TS object-literal excess-property checking.

  test("page-contributable keys are accepted on a plain staticData literal", () => {
    const ok: StaticDataRouteOption = {
      detailPanel: PanelComponent,
      pageTitle: "Detail",
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
    const ok: StaticDataRouteOption = defineShellStaticData<AppShellStaticData & AppPageStaticData>(
      {
        HeaderTitle: TitleComponent,
        detailPanel: PanelComponent,
      },
    );
    expectTypeOf(ok).toEqualTypeOf<StaticDataRouteOption>();
  });
});
