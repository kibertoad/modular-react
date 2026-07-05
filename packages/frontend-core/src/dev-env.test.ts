import { describe, it, expect, afterEach } from "vitest";
import { isDevEnv } from "./dev-env.js";

describe("isDevEnv", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns true when NODE_ENV is 'development'", () => {
    process.env.NODE_ENV = "development";
    expect(isDevEnv()).toBe(true);
  });

  it("returns false when NODE_ENV is 'production'", () => {
    process.env.NODE_ENV = "production";
    expect(isDevEnv()).toBe(false);
  });

  it("returns true when NODE_ENV is 'test' (default vitest mode)", () => {
    // The check is `!== "production"`, so any non-production value is dev.
    process.env.NODE_ENV = "test";
    expect(isDevEnv()).toBe(true);
  });

  it("returns true when NODE_ENV is unset", () => {
    delete process.env.NODE_ENV;
    expect(isDevEnv()).toBe(true);
  });

  describe("contract for browser bundles", () => {
    // These tests document the design intent: the helper uses a *literal*
    // `process.env.NODE_ENV` access so bundlers can statically replace it.
    // Vitest runs in Node so the literal reads the runtime env; in a Vite
    // browser build the same source becomes `"development" !== "production"`
    // (always true in dev) or `"production" !== "production"` (false, dead-
    // code-eliminated in prod).

    it("never throws when NODE_ENV is unset (catches a missing process global as a dev signal)", () => {
      delete process.env.NODE_ENV;
      expect(() => isDevEnv()).not.toThrow();
    });
  });
});
