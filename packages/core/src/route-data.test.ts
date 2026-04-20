import { describe, it, expect } from "vitest";
import { mergeRouteStaticData } from "./route-data.js";

// Helpers to mimic the two router shapes without pulling the router deps in.
type RRMatch = { handle?: unknown };
type TSMatch = { staticData?: unknown };
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
});
