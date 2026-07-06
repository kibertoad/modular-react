import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRouteDataOverrideWarner } from "./route-data-warn.js";

describe("createRouteDataOverrideWarner", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe("environment gating", () => {
    it("returns undefined in production so the merge skips its bookkeeping", () => {
      process.env.NODE_ENV = "production";
      const warn = createRouteDataOverrideWarner(
        "@react-router-modules/runtime",
        "useZones",
        "handle",
      );
      expect(warn).toBeUndefined();
    });

    it("returns a callback in development", () => {
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner(
        "@react-router-modules/runtime",
        "useZones",
        "handle",
      );
      expect(typeof warn).toBe("function");
    });

    it("returns a callback when NODE_ENV is unset (treat as dev)", () => {
      delete process.env.NODE_ENV;
      const warn = createRouteDataOverrideWarner(
        "@react-router-modules/runtime",
        "useZones",
        "handle",
      );
      expect(typeof warn).toBe("function");
    });
  });

  describe("warning content", () => {
    it("includes runtime label, hook, both route IDs, key, and field name", () => {
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner(
        "@react-router-modules/runtime",
        "useZones",
        "handle",
      )!;

      warn({
        key: "HeaderTitle",
        previousValue: "A",
        nextValue: "B",
        previousMatch: { id: "/project" },
        nextMatch: { id: "/project/$id/dashboard" },
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = String(warnSpy.mock.calls[0]?.[0] ?? "");
      expect(message).toContain("[@react-router-modules/runtime]");
      expect(message).toContain("useZones");
      expect(message).toContain("handle");
      expect(message).toContain("HeaderTitle");
      expect(message).toContain("/project");
      expect(message).toContain("/project/$id/dashboard");
    });

    it("formats the message correctly for the TanStack runtime label", () => {
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner(
        "@tanstack-react-modules/runtime",
        "useRouteData",
        "staticData",
      )!;

      warn({
        key: "headerVariant",
        previousValue: "portal",
        nextValue: "project",
        previousMatch: { routeId: "/p" },
        nextMatch: { routeId: "/p/c" },
      });

      const message = String(warnSpy.mock.calls[0]?.[0] ?? "");
      expect(message).toContain("[@tanstack-react-modules/runtime]");
      expect(message).toContain("useRouteData");
      expect(message).toContain("staticData");
    });

    it("falls back to TanStack-style routeId when id is absent", () => {
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner(
        "@react-router-modules/runtime",
        "useZones",
        "staticData",
      )!;

      warn({
        key: "HeaderTitle",
        previousValue: "A",
        nextValue: "B",
        previousMatch: { routeId: "/parent" },
        nextMatch: { routeId: "/parent/leaf" },
      });

      const message = String(warnSpy.mock.calls[0]?.[0] ?? "");
      expect(message).toContain("/parent");
      expect(message).toContain("/parent/leaf");
    });

    it("falls back to vue-router record name, then path, when id/routeId are absent", () => {
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner("@modular-vue/runtime", "useZones", "meta")!;

      // Ancestor has a named route; descendant only has a path.
      warn({
        key: "DetailPanel",
        previousValue: "A",
        nextValue: "B",
        previousMatch: { name: "billing" },
        nextMatch: { path: "/billing/:id" },
      });

      const message = String(warnSpy.mock.calls[0]?.[0] ?? "");
      expect(message).toContain("[@modular-vue/runtime]");
      expect(message).toContain("meta");
      expect(message).toContain("billing");
      expect(message).toContain("/billing/:id");
    });

    it("disambiguates the message by match position when two records share the same id", () => {
      // vue-router nameless index routes report the same `path` as their
      // parent, so prevId === nextId. Without the position the message reads
      // as a route overriding itself; with it the two records are distinct.
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner("@modular-vue/runtime", "useZones", "meta")!;

      warn({
        key: "HeaderActions",
        previousValue: "A",
        nextValue: "B",
        previousMatch: { path: "/dashboard" },
        nextMatch: { path: "/dashboard" },
        previousIndex: 0,
        nextIndex: 1,
      });

      const message = String(warnSpy.mock.calls[0]?.[0] ?? "");
      expect(message).toContain("/dashboard (match 1)");
      expect(message).toContain("/dashboard (match 0)");
    });

    it("uses <unknown> when neither id nor routeId is present", () => {
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner(
        "@react-router-modules/runtime",
        "useZones",
        "handle",
      )!;

      warn({
        key: "HeaderTitle",
        previousValue: "A",
        nextValue: "B",
        previousMatch: {},
        nextMatch: {},
      });

      const message = String(warnSpy.mock.calls[0]?.[0] ?? "");
      expect(message).toContain("<unknown>");
    });
  });

  describe("type contract", () => {
    it("rejects unknown labels at compile time", () => {
      // Compile-time-only check: typecheck must catch label typos and
      // out-of-set values. The function is never called — the assertions
      // are the @ts-expect-error directives.
      void (() => {
        // @ts-expect-error – "@unknown/runtime" is not a RouteDataRuntimeLabel
        createRouteDataOverrideWarner("@unknown/runtime", "useZones", "handle");
        // @ts-expect-error – "useZone" (typo) is not a RouteDataHookName
        createRouteDataOverrideWarner("@react-router-modules/runtime", "useZone", "handle");
        // @ts-expect-error – "props" is not a RouteDataFieldLabel
        createRouteDataOverrideWarner("@react-router-modules/runtime", "useZones", "props");
      });
    });
  });

  describe("dedup behavior", () => {
    it("logs once per (key, prevId, nextId) triple regardless of call count", () => {
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner(
        "@react-router-modules/runtime",
        "useZones",
        "handle",
      )!;
      const info = {
        key: "HeaderTitle",
        previousValue: "A",
        nextValue: "B",
        previousMatch: { id: "/p" },
        nextMatch: { id: "/p/c" },
      };

      warn(info);
      warn(info);
      warn(info);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("logs separately for different keys at the same routes", () => {
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner(
        "@react-router-modules/runtime",
        "useZones",
        "handle",
      )!;

      warn({
        key: "HeaderTitle",
        previousValue: "A",
        nextValue: "B",
        previousMatch: { id: "/p" },
        nextMatch: { id: "/p/c" },
      });
      warn({
        key: "HeaderActions",
        previousValue: "X",
        nextValue: "Y",
        previousMatch: { id: "/p" },
        nextMatch: { id: "/p/c" },
      });

      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it("logs separately for the same key on different route pairs", () => {
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner(
        "@react-router-modules/runtime",
        "useZones",
        "handle",
      )!;

      warn({
        key: "HeaderTitle",
        previousValue: "A",
        nextValue: "B",
        previousMatch: { id: "/p" },
        nextMatch: { id: "/p/c" },
      });
      warn({
        key: "HeaderTitle",
        previousValue: "A",
        nextValue: "B",
        previousMatch: { id: "/q" },
        nextMatch: { id: "/q/c" },
      });

      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it("does not collapse distinct overrides that share an id but sit at different positions", () => {
      // Two nameless index routes both resolve to `/dashboard`, so readMatchId
      // returns the same id for each override site. Folding the match position
      // into the dedup key keeps the second real clobber from being silenced.
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner("@modular-vue/runtime", "useZones", "meta")!;

      warn({
        key: "HeaderActions",
        previousValue: "A",
        nextValue: "B",
        previousMatch: { path: "/dashboard" },
        nextMatch: { path: "/dashboard" },
        previousIndex: 0,
        nextIndex: 1,
      });
      warn({
        key: "HeaderActions",
        previousValue: "B",
        nextValue: "C",
        previousMatch: { path: "/dashboard" },
        nextMatch: { path: "/dashboard" },
        previousIndex: 1,
        nextIndex: 2,
      });

      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it("uses an unambiguous separator so a space in any triple part can't collide", () => {
      // Regression rail for the dedup-key serialization. Before the
      // separator switched from a plain space to \x1F, the triples
      //   ("Header Title", "/p",   "/p/c")  →  "Header Title /p /p/c"
      //   ("Header",       "Title /p", "/p/c") → "Header Title /p /p/c"
      // would have hashed to the same dedup key and silenced the second
      // warning. With \x1F the two strings are distinguishable.
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner(
        "@react-router-modules/runtime",
        "useZones",
        "handle",
      )!;

      warn({
        key: "Header Title",
        previousValue: "A",
        nextValue: "B",
        previousMatch: { id: "/p" },
        nextMatch: { id: "/p/c" },
      });
      warn({
        key: "Header",
        previousValue: "A",
        nextValue: "B",
        previousMatch: { id: "Title /p" },
        nextMatch: { id: "/p/c" },
      });

      expect(warnSpy).toHaveBeenCalledTimes(2);
    });
  });
});
