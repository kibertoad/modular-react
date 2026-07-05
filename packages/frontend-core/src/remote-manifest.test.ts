import { describe, it, expect, expectTypeOf } from "vitest";
import {
  mergeRemoteManifests,
  type MergedRemoteManifests,
  type RemoteModuleManifest,
  type RemoteNavigationItem,
} from "./remote-manifest.js";
import { buildSlotsManifest, evaluateDynamicSlots } from "./slots.js";
import type { NavigationItem, NavigationItemBase, ModuleDescriptor } from "./types.js";

interface TestSlots {
  commands: readonly { id: string; label: string }[];
  systems: readonly { id: string; name: string }[];
}

function manifest(
  overrides: Partial<RemoteModuleManifest<TestSlots>> & { id: string },
): RemoteModuleManifest<TestSlots> {
  return { version: "1.0.0", ...overrides };
}

describe("mergeRemoteManifests", () => {
  it("returns empty slots/navigation/meta for an empty input", () => {
    const merged = mergeRemoteManifests<TestSlots>([]);
    expect(merged.slots).toEqual({});
    expect(merged.navigation).toEqual([]);
    expect(merged.meta).toEqual({});
  });

  it("concatenates slot contributions across manifests, preserving order", () => {
    const m1 = manifest({
      id: "a",
      slots: { commands: [{ id: "a1", label: "A1" }] },
    });
    const m2 = manifest({
      id: "b",
      slots: {
        commands: [{ id: "b1", label: "B1" }],
        systems: [{ id: "b-sys", name: "B Sys" }],
      },
    });

    const merged = mergeRemoteManifests<TestSlots>([m1, m2]);

    expect(merged.slots.commands).toEqual([
      { id: "a1", label: "A1" },
      { id: "b1", label: "B1" },
    ]);
    expect(merged.slots.systems).toEqual([{ id: "b-sys", name: "B Sys" }]);
  });

  it("concatenates navigation items across manifests, preserving input order", () => {
    const m1 = manifest({ id: "a", navigation: [{ label: "First", to: "/a" }] });
    const m2 = manifest({
      id: "b",
      navigation: [
        { label: "Second", to: "/b" },
        { label: "Third", to: "/b/x" },
      ],
    });

    const merged = mergeRemoteManifests<TestSlots>([m1, m2]);

    expect(merged.navigation).toEqual([
      { label: "First", to: "/a" },
      { label: "Second", to: "/b" },
      { label: "Third", to: "/b/x" },
    ]);
  });

  it("indexes meta by manifest id", () => {
    const m1 = manifest({ id: "salesforce", meta: { name: "Salesforce" } });
    const m2 = manifest({ id: "hubspot", meta: { name: "HubSpot", category: "crm" } });

    const merged = mergeRemoteManifests<TestSlots>([m1, m2]);

    expect(merged.meta).toEqual({
      salesforce: { name: "Salesforce" },
      hubspot: { name: "HubSpot", category: "crm" },
    });
  });

  it("skips meta when a manifest has no meta", () => {
    const m1 = manifest({ id: "a" });
    const m2 = manifest({ id: "b", meta: { name: "B" } });

    const merged = mergeRemoteManifests<TestSlots>([m1, m2]);

    expect(merged.meta).toEqual({ b: { name: "B" } });
  });

  it("throws on duplicate ids", () => {
    const m1 = manifest({ id: "dup" });
    const m2 = manifest({ id: "dup" });

    expect(() => mergeRemoteManifests<TestSlots>([m1, m2])).toThrow(
      /duplicate remote manifest id "dup"/,
    );
  });

  it("ignores non-array slot values defensively", () => {
    // Bypass the type so we can simulate a manifest that sneaks through
    // without runtime validation (wire boundary trust boundary).
    const bad = {
      id: "a",
      version: "1.0.0",
      slots: { commands: "not-an-array" },
    } as unknown as RemoteModuleManifest<TestSlots>;

    const merged = mergeRemoteManifests<TestSlots>([bad]);

    expect(merged.slots.commands).toBeUndefined();
  });

  it("does not sort — callers rely on buildNavigationManifest for ordering", () => {
    const m1 = manifest({
      id: "a",
      navigation: [{ label: "Later", to: "/later", order: 10 }],
    });
    const m2 = manifest({
      id: "b",
      navigation: [{ label: "Earlier", to: "/earlier", order: 1 }],
    });

    const merged = mergeRemoteManifests<TestSlots>([m1, m2]);

    expect(merged.navigation.map((n) => n.label)).toEqual(["Later", "Earlier"]);
  });

  // This is the integration path the helper exists to support: the output of
  // mergeRemoteManifests plugs into a module's `dynamicSlots` without the
  // caller having to reshape it. If this breaks, the whole pattern is dead.
  describe("integrates with evaluateDynamicSlots", () => {
    it("flows through as a dynamicSlots factory result alongside static slots", () => {
      const staticCommand = { id: "local", label: "Local Command" };
      const remoteCommand = { id: "remote", label: "Remote Command" };

      const localModule: ModuleDescriptor<Record<string, unknown>, TestSlots> = {
        id: "integrations",
        version: "1.0.0",
        slots: { commands: [staticCommand] },
      };

      const baseSlots = buildSlotsManifest<TestSlots>([localModule], {
        commands: [],
        systems: [],
      });

      const remotes: RemoteModuleManifest<TestSlots>[] = [
        manifest({ id: "remote-a", slots: { commands: [remoteCommand] } }),
      ];

      // Mimics the documented integrations-module pattern.
      const dynamicSlots = (_deps: Record<string, unknown>) =>
        mergeRemoteManifests<TestSlots>(remotes).slots;

      const resolved = evaluateDynamicSlots(baseSlots, [dynamicSlots], {});

      expect(resolved.commands).toEqual([staticCommand, remoteCommand]);
      expect(resolved.systems).toEqual([]);
    });
  });
});

// Compile-only tests covering the JSON-safe narrowing contracts. These assert
// the shape the TYPE SYSTEM refuses — runtime tests can't catch regressions
// here because a silently widened type compiles and runs fine.
describe("RemoteModuleManifest (type-level)", () => {
  it("satisfies NavigationItemBase so it flows into module/manifest generics", () => {
    expectTypeOf<RemoteNavigationItem>().toExtend<NavigationItemBase>();
  });

  it("accepts typed labels and typed meta through its generics", () => {
    type Keys = "nav.home" | "nav.billing";
    type Meta = { badge?: "beta"; category: string };
    type Narrow = RemoteNavigationItem<Keys, Meta>;

    expectTypeOf<Narrow["label"]>().toEqualTypeOf<Keys>();
    expectTypeOf<Narrow["meta"]>().toEqualTypeOf<Meta | undefined>();
    expectTypeOf<Narrow>().toExtend<NavigationItemBase>();
  });

  it("narrows `to` to string — a function `to` is not JSON-safe", () => {
    expectTypeOf<RemoteNavigationItem["to"]>().toEqualTypeOf<string>();

    // @ts-expect-error — function `to` is rejected at the remote boundary.
    const bad: RemoteNavigationItem = { label: "x", to: () => "/x" };
    void bad;
  });

  it("narrows `icon` to string — a ComponentType icon is not JSON-safe", () => {
    expectTypeOf<RemoteNavigationItem["icon"]>().toEqualTypeOf<string | undefined>();
  });

  it("refuses non-JSON-safe ModuleDescriptor fields on RemoteModuleManifest", () => {
    // Exhaustive list of the fields the narrowed type is supposed to drop.
    type RemoteKeys = keyof RemoteModuleManifest<TestSlots>;
    type ForbiddenKey =
      | "component"
      | "zones"
      | "createRoutes"
      | "dynamicSlots"
      | "lifecycle"
      | "requires"
      | "optionalRequires";

    // None of the forbidden keys survive into RemoteModuleManifest. If a
    // refactor widens the type, this intersection becomes non-never.
    expectTypeOf<RemoteKeys & ForbiddenKey>().toEqualTypeOf<never>();
  });

  it("preserves the slot map type end-to-end through mergeRemoteManifests", () => {
    type M = MergedRemoteManifests<TestSlots>;
    // `slots` keys are the app's declared slots; values keep their item shape.
    expectTypeOf<M["slots"]["commands"]>().toEqualTypeOf<TestSlots["commands"] | undefined>();
    expectTypeOf<M["slots"]["systems"]>().toEqualTypeOf<TestSlots["systems"] | undefined>();
  });

  it("flows through a generic app nav-item type", () => {
    type Keys = "nav.portal";
    type Meta = { action: "managePortal" };
    type AppRemoteNavItem = RemoteNavigationItem<Keys, Meta>;
    type AppRemoteManifest = RemoteModuleManifest<TestSlots, AppRemoteNavItem>;

    expectTypeOf<
      NonNullable<AppRemoteManifest["navigation"]>[number]
    >().toEqualTypeOf<AppRemoteNavItem>();

    // And the return type of mergeRemoteManifests preserves it too.
    const merged = mergeRemoteManifests<TestSlots, AppRemoteNavItem>([]);
    expectTypeOf(merged.navigation).toEqualTypeOf<readonly AppRemoteNavItem[]>();
  });

  it("a default NavigationItem is NOT assignable to RemoteNavigationItem (function `to` allowed on the default)", () => {
    // Sanity check: if someone passes the regular NavigationItem through, TS
    // should refuse — otherwise the whole "JSON-safe" premise is broken.
    type Plain = NavigationItem<string, { workspaceId: string }>;
    expectTypeOf<Plain>().not.toExtend<RemoteNavigationItem>();
  });
});
