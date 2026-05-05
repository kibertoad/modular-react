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
      const warn = createRouteDataOverrideWarner("@x/runtime", "useZones", "handle");
      expect(warn).toBeUndefined();
    });

    it("returns a callback in development", () => {
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner("@x/runtime", "useZones", "handle");
      expect(typeof warn).toBe("function");
    });

    it("returns a callback when NODE_ENV is unset (treat as dev)", () => {
      delete process.env.NODE_ENV;
      const warn = createRouteDataOverrideWarner("@x/runtime", "useZones", "handle");
      expect(typeof warn).toBe("function");
    });
  });

  describe("warning content", () => {
    it("includes runtime label, hook, both route IDs, key, and field name", () => {
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner("@x/runtime", "useZones", "handle")!;

      warn({
        key: "HeaderTitle",
        previousValue: "A",
        nextValue: "B",
        previousMatch: { id: "/project" },
        nextMatch: { id: "/project/$id/dashboard" },
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = String(warnSpy.mock.calls[0]?.[0] ?? "");
      expect(message).toContain("[@x/runtime]");
      expect(message).toContain("useZones");
      expect(message).toContain("handle");
      expect(message).toContain("HeaderTitle");
      expect(message).toContain("/project");
      expect(message).toContain("/project/$id/dashboard");
    });

    it("falls back to TanStack-style routeId when id is absent", () => {
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner("@x/runtime", "useZones", "staticData")!;

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

    it("uses <unknown> when neither id nor routeId is present", () => {
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner("@x/runtime", "useZones", "handle")!;

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

  describe("dedup behavior", () => {
    it("logs once per (key, prevId, nextId) triple regardless of call count", () => {
      process.env.NODE_ENV = "development";
      const warn = createRouteDataOverrideWarner("@x/runtime", "useZones", "handle")!;
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
      const warn = createRouteDataOverrideWarner("@x/runtime", "useZones", "handle")!;

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
      const warn = createRouteDataOverrideWarner("@x/runtime", "useZones", "handle")!;

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
  });
});
