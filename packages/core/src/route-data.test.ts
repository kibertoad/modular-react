import { describe, it, expect, vi } from "vitest";
import { mergeRouteStaticData, type RouteStaticDataOverrideInfo } from "./route-data.js";

// Helpers to mimic the two router shapes without pulling the router deps in.
type RRMatch = { id?: string; handle?: unknown };
type TSMatch = { id?: string; staticData?: unknown };
const getHandle = (m: unknown) => (m as RRMatch).handle;
const getStaticData = (m: unknown) => (m as TSMatch).staticData;

describe("mergeRouteStaticData", () => {
  describe("traversal order", () => {
    it("merges keys across every match in the given order", () => {
      const matches: RRMatch[] = [{ handle: { a: 1 } }, { handle: { b: 2 } }, { handle: { c: 3 } }];
      expect(mergeRouteStaticData(matches, getHandle)).toEqual({ a: 1, b: 2, c: 3 });
    });

    it("deepest match wins when keys collide (root → leaf)", () => {
      // The runtime passes matches root-first — this test pins that contract.
      const matches: RRMatch[] = [
        { handle: { variant: "portal", title: "Portal" } },
        { handle: { variant: "project" } },
      ];
      expect(mergeRouteStaticData(matches, getHandle)).toEqual({
        variant: "project",
        title: "Portal",
      });
    });
  });

  describe("undefined handling", () => {
    it("skips undefined values so a leaf does not clobber an ancestor", () => {
      const matches: RRMatch[] = [
        { handle: { HeaderActions: "ParentBar" } },
        { handle: { HeaderActions: undefined } },
      ];
      expect(mergeRouteStaticData(matches, getHandle)).toEqual({ HeaderActions: "ParentBar" });
    });

    it("preserves falsy-but-defined values (0, '', false, null)", () => {
      const matches: RRMatch[] = [
        {
          handle: {
            count: 0,
            label: "",
            enabled: false,
            parent: null,
          },
        },
      ];
      expect(mergeRouteStaticData(matches, getHandle)).toEqual({
        count: 0,
        label: "",
        enabled: false,
        parent: null,
      });
    });
  });

  describe("missing or non-object data", () => {
    it("returns an empty object when matches is empty", () => {
      expect(mergeRouteStaticData([], getHandle)).toEqual({});
    });

    it("ignores matches where the data field is missing", () => {
      const matches: RRMatch[] = [{}, { handle: { a: 1 } }, {}];
      expect(mergeRouteStaticData(matches, getHandle)).toEqual({ a: 1 });
    });

    it.each([
      ["null", null],
      ["undefined", undefined],
      ["a string", "not-an-object"],
      ["a number", 42],
    ])("ignores matches where the data field is %s", (_, value) => {
      const matches = [{ handle: value }, { handle: { a: 1 } }];
      expect(mergeRouteStaticData(matches, getHandle)).toEqual({ a: 1 });
    });

    it("ignores matches where the data field is an array — avoids silent index-key leakage", () => {
      // `typeof [] === "object"` so without an explicit `Array.isArray` guard,
      // the merge would enumerate the array as `{ 0: ..., 1: ... }`. Guard
      // this behavior: arrays at this position are a mistake on the consumer's
      // side and should be treated as "no data", not as indexed key-value
      // pairs.
      const matches = [{ handle: [1, 2, 3] }, { handle: { a: 1 } }];
      expect(mergeRouteStaticData(matches, getHandle)).toEqual({ a: 1 });
    });
  });

  describe("getter is what distinguishes the two runtimes", () => {
    // A single call site + a getter is the whole point of the helper —
    // these parallel tests exist so a regression that silently reads the
    // wrong field would surface as a failed test, not mysterious empty zones.
    const matches: (RRMatch & TSMatch)[] = [
      { handle: { a: "from-handle" }, staticData: { b: "from-static" } },
    ];

    it("reads from `handle` when given the handle getter (React Router)", () => {
      expect(mergeRouteStaticData(matches, getHandle)).toEqual({ a: "from-handle" });
    });

    it("reads from `staticData` when given the staticData getter (TanStack)", () => {
      expect(mergeRouteStaticData(matches, getStaticData)).toEqual({ b: "from-static" });
    });
  });

  describe("does not mutate inputs", () => {
    it("returns a fresh object — callers can freely mutate", () => {
      const handle = { a: 1 };
      const matches: RRMatch[] = [{ handle }];
      const merged = mergeRouteStaticData<{ a: number }>(matches, getHandle);
      (merged as Record<string, unknown>).a = 999;
      expect(handle.a).toBe(1);
    });
  });

  describe("null preservation (the explicit-clear escape hatch)", () => {
    it("treats `null` as a normal defined value — a deeper route uses it to clear an ancestor's contribution", () => {
      // The merge has no special-case for null: a leaf can clear an
      // ancestor's zone by setting `null`, and the rendering shell decides
      // how to interpret it (typically: as if absent). This is documented
      // as the *only* in-merge way to remove an inherited value, since
      // `undefined` is silently skipped by design.
      const matches: RRMatch[] = [
        { handle: { HeaderActions: "ParentBar" } },
        { handle: { HeaderActions: null } },
      ];
      expect(mergeRouteStaticData(matches, getHandle)).toEqual({ HeaderActions: null });
    });
  });

  describe("onOverride callback", () => {
    it("fires when a deeper match overrides an ancestor's key, with both matches and values", () => {
      const onOverride = vi.fn<(info: RouteStaticDataOverrideInfo) => void>();
      const parent: RRMatch = { id: "/project", handle: { HeaderTitle: "ParentTitle" } };
      const child: RRMatch = { id: "/project/$id", handle: { HeaderTitle: "ChildTitle" } };

      mergeRouteStaticData([parent, child], getHandle, { onOverride });

      expect(onOverride).toHaveBeenCalledTimes(1);
      expect(onOverride).toHaveBeenCalledWith({
        key: "HeaderTitle",
        previousValue: "ParentTitle",
        nextValue: "ChildTitle",
        previousMatch: parent,
        nextMatch: child,
      });
    });

    it("does not fire when a deeper match contributes a brand-new key", () => {
      const onOverride = vi.fn<(info: RouteStaticDataOverrideInfo) => void>();
      const matches: RRMatch[] = [
        { id: "/", handle: { HeaderTitle: "Title" } },
        { id: "/child", handle: { DetailPanel: "Panel" } },
      ];

      mergeRouteStaticData(matches, getHandle, { onOverride });
      expect(onOverride).not.toHaveBeenCalled();
    });

    it("does not fire for `undefined` at a deeper level — that is inheritance, not override", () => {
      const onOverride = vi.fn<(info: RouteStaticDataOverrideInfo) => void>();
      const matches: RRMatch[] = [
        { id: "/", handle: { HeaderTitle: "Title" } },
        { id: "/child", handle: { HeaderTitle: undefined } },
      ];

      mergeRouteStaticData(matches, getHandle, { onOverride });
      expect(onOverride).not.toHaveBeenCalled();
    });

    it("fires for `null` overrides — explicit clearing is still an override the dev tool should surface", () => {
      const onOverride = vi.fn<(info: RouteStaticDataOverrideInfo) => void>();
      const matches: RRMatch[] = [
        { id: "/", handle: { HeaderTitle: "Title" } },
        { id: "/child", handle: { HeaderTitle: null } },
      ];

      mergeRouteStaticData(matches, getHandle, { onOverride });
      expect(onOverride).toHaveBeenCalledTimes(1);
      expect(onOverride.mock.calls[0]?.[0]).toMatchObject({
        key: "HeaderTitle",
        previousValue: "Title",
        nextValue: null,
      });
    });

    it("fires once per chained override — every overwrite is reported", () => {
      const onOverride = vi.fn<(info: RouteStaticDataOverrideInfo) => void>();
      const matches: RRMatch[] = [
        { id: "/", handle: { HeaderTitle: "A" } },
        { id: "/mid", handle: { HeaderTitle: "B" } },
        { id: "/leaf", handle: { HeaderTitle: "C" } },
      ];

      mergeRouteStaticData(matches, getHandle, { onOverride });
      expect(onOverride).toHaveBeenCalledTimes(2);
      expect(onOverride.mock.calls[0]?.[0]).toMatchObject({
        previousValue: "A",
        nextValue: "B",
      });
      expect(onOverride.mock.calls[1]?.[0]).toMatchObject({
        previousValue: "B",
        nextValue: "C",
      });
    });

    it("incurs no source-tracking when onOverride is omitted (regression rail)", () => {
      // No explicit assertion possible without exposing internals — but the
      // merged result must be identical to the no-options call. This pins
      // the contract: optional bookkeeping must not change merge output.
      const matches: RRMatch[] = [
        { id: "/", handle: { a: 1, b: 2 } },
        { id: "/child", handle: { a: 9, c: 3 } },
      ];
      const withoutOptions = mergeRouteStaticData(matches, getHandle);
      const withNoopCallback = mergeRouteStaticData(matches, getHandle, { onOverride: () => {} });
      expect(withoutOptions).toEqual(withNoopCallback);
      expect(withoutOptions).toEqual({ a: 9, b: 2, c: 3 });
    });
  });
});
