import { describe, it, expect } from "vitest";
import { buildDepsSnapshot, runLifecycleHooks } from "./runtime-types.js";
import { createStore } from "./store.js";
import type { ReactiveService } from "./types.js";

describe("buildDepsSnapshot", () => {
  it("reads getState from stores", () => {
    const authStore = createStore({ user: "alice" });
    const result = buildDepsSnapshot({ stores: { auth: authStore } });
    expect(result.auth).toEqual({ user: "alice" });
  });

  it("passes services through directly", () => {
    const httpClient = { get: () => {} };
    const result = buildDepsSnapshot({ services: { httpClient } });
    expect(result.httpClient).toBe(httpClient);
  });

  it("reads getSnapshot from reactive services", () => {
    const rs: ReactiveService<string> = {
      subscribe: () => () => {},
      getSnapshot: () => "connected",
    };
    const result = buildDepsSnapshot({ reactiveServices: { presence: rs } });
    expect(result.presence).toBe("connected");
  });
});

describe("runLifecycleHooks", () => {
  it("calls onRegister for each module", () => {
    const hook1 = { onRegister: (_deps: any) => {} };
    const hook2 = { onRegister: (_deps: any) => {} };
    const m1 = { id: "a", version: "1", lifecycle: hook1 };
    const m2 = { id: "b", version: "1", lifecycle: hook2 };

    let called: string[] = [];
    hook1.onRegister = () => {
      called.push("a");
    };
    hook2.onRegister = () => {
      called.push("b");
    };

    runLifecycleHooks([m1, m2] as any, {});
    expect(called).toEqual(["a", "b"]);
  });

  it("wraps errors with module ID", () => {
    const m = {
      id: "broken",
      version: "1",
      lifecycle: {
        onRegister: () => {
          throw new Error("boom");
        },
      },
    };

    expect(() => runLifecycleHooks([m] as any, {})).toThrow(
      /Module "broken" lifecycle.onRegister\(\) failed: boom/,
    );
  });
});
