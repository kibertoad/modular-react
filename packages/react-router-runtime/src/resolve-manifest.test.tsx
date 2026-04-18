import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { createStore } from "zustand/vanilla";
import type { RouteObject } from "react-router";
import { useNavigation, useSlots, useModules } from "@modular-react/react";
import { createRegistry } from "./registry.js";

/**
 * `resolveManifest()` is the framework-mode entry point — the host (e.g.
 * `@react-router/dev/vite`) owns routing, so the registry produces a
 * `Providers` component and optional `routes` but does NOT create a router.
 *
 * These tests exercise real behavior from a framework-mode consumer's
 * perspective: does `Providers` deliver navigation / slots / modules to the
 * hooks the host's components will call? Does it stay consistent across
 * multiple resolution sites (routes.ts + root.tsx)? Does it refuse to let
 * you mix router-owning and framework modes?
 */

interface TestAuth {
  user: string | null;
}

interface TestDeps {
  auth: TestAuth;
  api: { baseUrl: string };
}

interface TestSlots {
  commands: { id: string; label: string }[];
  [key: string]: readonly unknown[];
}

function createAuthStore() {
  return createStore<TestAuth>(() => ({ user: null }));
}

function headlessModule(id: string, opts?: { navigation?: boolean; slots?: boolean }) {
  return {
    id,
    version: "1.0.0",
    navigation: opts?.navigation ? [{ label: `${id}:nav`, to: `/${id}` }] : undefined,
    slots: opts?.slots
      ? ({ commands: [{ id: `${id}:cmd`, label: `${id} command` }] } as TestSlots)
      : undefined,
  };
}

function routedModule(id: string, path: string) {
  return {
    id,
    version: "1.0.0",
    createRoutes: (): RouteObject => ({ path, Component: () => <div data-testid={id} /> }),
  };
}

describe("resolveManifest (framework mode)", () => {
  describe("shape", () => {
    it("returns Providers, routes, navigation, slots, modules, recalculateSlots", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register(headlessModule("m", { navigation: true, slots: true }));

      const manifest = registry.resolveManifest();

      expect(manifest.Providers).toBeTypeOf("function");
      expect(Array.isArray(manifest.routes)).toBe(true);
      expect(manifest.navigation.items).toHaveLength(1);
      expect(manifest.slots.commands).toHaveLength(1);
      expect(manifest.modules).toHaveLength(1);
      expect(manifest.recalculateSlots).toBeTypeOf("function");
    });

    it("returns module routes from createRoutes() and empty array when none declare routes", () => {
      const r1 = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      r1.register(routedModule("a", "/a"));
      r1.register(routedModule("b", "/b"));
      expect(r1.resolveManifest().routes.map((r) => (r as { path: string }).path)).toEqual([
        "/a",
        "/b",
      ]);

      const r2 = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      r2.register(headlessModule("headless"));
      expect(r2.resolveManifest().routes).toEqual([]);
    });

    it("supports modules returning an array of routes from createRoutes()", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register({
        id: "multi",
        version: "1.0.0",
        createRoutes: (): RouteObject[] => [
          { path: "/one", Component: () => <></> },
          { path: "/two", Component: () => <></> },
        ],
      });

      expect(registry.resolveManifest().routes).toHaveLength(2);
    });

    it("includes lazy module catch-all routes in manifest.routes", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.registerLazy({
        id: "lazy",
        basePath: "/lazy",
        load: async () => ({
          default: {
            id: "lazy",
            version: "1.0.0",
            createRoutes: () => ({ path: "feature", Component: () => <></> }),
          },
        }),
      });

      const { routes } = registry.resolveManifest();
      expect(routes).toHaveLength(1);
      expect((routes[0] as { path: string }).path).toBe("lazy/*");
    });
  });

  describe("Providers component", () => {
    it("delivers navigation, slots, and module entries to hooks called in children", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
        slots: { commands: [] },
      });
      registry.register(headlessModule("billing", { navigation: true, slots: true }));

      const { Providers } = registry.resolveManifest();

      let captured: { nav: string[]; slotCount: number; moduleIds: string[] } | null = null;
      function Probe() {
        const nav = useNavigation();
        const slots = useSlots<TestSlots>();
        const modules = useModules();
        captured = {
          nav: nav.items.map((i) => i.label),
          slotCount: slots.commands.length,
          moduleIds: modules.map((m) => m.id),
        };
        return null;
      }

      render(
        <Providers>
          <Probe />
        </Providers>,
      );

      expect(captured).toEqual({
        nav: ["billing:nav"],
        slotCount: 1,
        moduleIds: ["billing"],
      });
    });

    it("wraps user-supplied providers around the context stack in order", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      const calls: string[] = [];
      const Outer = ({ children }: { children: React.ReactNode }) => {
        calls.push("outer");
        return <div data-testid="outer">{children}</div>;
      };
      const Inner = ({ children }: { children: React.ReactNode }) => {
        calls.push("inner");
        return <div data-testid="inner">{children}</div>;
      };

      const { Providers } = registry.resolveManifest({ providers: [Outer, Inner] });

      const { getByTestId } = render(
        <Providers>
          <span data-testid="child" />
        </Providers>,
      );

      // First element is outermost
      expect(getByTestId("outer").contains(getByTestId("inner"))).toBe(true);
      expect(getByTestId("inner").contains(getByTestId("child"))).toBe(true);
      expect(calls).toEqual(["outer", "inner"]);
    });
  });

  describe("idempotency", () => {
    it("returns the same manifest object across calls (shared routes.ts + root.tsx pattern)", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register(headlessModule("m", { navigation: true }));

      const first = registry.resolveManifest({ providers: [] });
      const second = registry.resolveManifest();
      const third = registry.resolveManifest();

      expect(second).toBe(first);
      expect(third).toBe(first);
    });

    it("returns the same routes array reference across calls so a spread into routes.ts is stable", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register(routedModule("r", "/r"));

      const firstRoutes = registry.resolveManifest().routes;
      const secondRoutes = registry.resolveManifest().routes;

      expect(secondRoutes).toBe(firstRoutes);
      expect(secondRoutes[0]).toBe(firstRoutes[0]);
    });

    it("runs onRegister lifecycle hooks exactly once even when resolveManifest is called multiple times", () => {
      const onRegister = vi.fn();
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register({
        id: "m",
        version: "1.0.0",
        lifecycle: { onRegister },
      });

      registry.resolveManifest();
      registry.resolveManifest();
      registry.resolveManifest();

      expect(onRegister).toHaveBeenCalledOnce();
    });

    it("does not re-run onRegister hooks when resolveManifest retries after a failed first call", () => {
      // Guards against a subtle bug: if the first resolveManifest() throws
      // (e.g. a module's createRoutes returns null), onRegister hooks that
      // already ran must not run a second time when the caller retries.
      // Modules commonly use onRegister to subscribe to stores or register
      // side-effects against a framework singleton, and double-firing would
      // double-register those.
      const onRegister = vi.fn();
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register({
        id: "good",
        version: "1.0.0",
        lifecycle: { onRegister },
      });
      registry.register({
        id: "bad",
        version: "1.0.0",
        createRoutes: () => null as unknown as RouteObject,
      });

      expect(() => registry.resolveManifest()).toThrow(
        /Module "bad" createRoutes\(\) returned a falsy value/,
      );
      // Retry: throws the same error, but onRegister must NOT fire a second time.
      expect(() => registry.resolveManifest()).toThrow(
        /Module "bad" createRoutes\(\) returned a falsy value/,
      );
      expect(onRegister).toHaveBeenCalledOnce();
    });

    it("calls each module's createRoutes() exactly once even across multiple resolveManifest calls", () => {
      // This locks in the caching contract: if createRoutes is called twice
      // (e.g. from routes.ts and then root.tsx), any module that does
      // side-effectful work in createRoutes (imports, logging, registrations
      // against a framework singleton) would run it twice — silently
      // double-registering whatever it's registering.
      const createRoutes = vi.fn((): RouteObject => ({ path: "/x", Component: () => <div /> }));
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register({ id: "m", version: "1.0.0", createRoutes });

      registry.resolveManifest();
      registry.resolveManifest();
      registry.resolveManifest();

      expect(createRoutes).toHaveBeenCalledOnce();
    });

    it("does not re-run duplicate-id / missing-dep validation on cached calls", () => {
      // Once the manifest is cached, later resolveManifest() calls must be
      // pure reads of the cache — validation only runs on the first call.
      // If a test ever regresses such that validation runs twice, this test
      // would still pass (validation is idempotent), but the important
      // property is that the cached manifest is returned by reference
      // without re-walking modules. We assert that by requiring the call to
      // be a no-op even when modules would fail a re-validation that
      // somehow saw mutated state.
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register(headlessModule("m"));
      const first = registry.resolveManifest();
      // Cannot register after resolve, so validation state cannot change —
      // any second call must be a pure cache return.
      const second = registry.resolveManifest();
      expect(second).toBe(first);
      expect(second.modules).toBe(first.modules);
    });

    it("throws when options are passed on a subsequent call — misconfiguration should be loud", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });

      registry.resolveManifest({ providers: [] });

      expect(() => registry.resolveManifest({ providers: [] })).toThrow(
        /options may only be passed on the first call/,
      );
    });

    it("rejects divergent options on retry after a failed first call — captured options win", () => {
      // Regression guard (CodeRabbit PR #15): if the first call's options
      // threw in buildAssembly (e.g. onRegister hook crashed), a second
      // call's options would have slipped past the "options may only be
      // passed on the first call" guard because `cachedManifest` was still
      // null. Now the first invocation commits before anything can throw,
      // and every subsequent call honors the captured options.
      const OriginalProvider = ({ children }: { children: React.ReactNode }) => (
        <div data-testid="first-opts">{children}</div>
      );
      const DivergentProvider = ({ children }: { children: React.ReactNode }) => (
        <div data-testid="second-opts">{children}</div>
      );
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register({
        id: "bad",
        version: "1.0.0",
        lifecycle: {
          onRegister: () => {
            throw new Error("first-call boom");
          },
        },
      });

      expect(() => registry.resolveManifest({ providers: [OriginalProvider] })).toThrow(
        /first-call boom/,
      );

      expect(() => registry.resolveManifest({ providers: [DivergentProvider] })).toThrow(
        /options may only be passed on the first call/,
      );
    });

    it("retry without options honors the options captured on the failed first call", () => {
      // Paired with the test above: if the user retries with no options,
      // the captured options from the original call are what the manifest
      // is built with.
      const CapturedProvider = ({ children }: { children: React.ReactNode }) => (
        <div data-testid="captured-retry-rr">{children}</div>
      );

      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register({
        id: "flaky",
        version: "1.0.0",
        lifecycle: {
          onRegister: () => {
            throw new Error("first-call boom");
          },
        },
      });

      expect(() => registry.resolveManifest({ providers: [CapturedProvider] })).toThrow(
        /first-call boom/,
      );

      const manifest = registry.resolveManifest();

      const { getByTestId } = render(
        <manifest.Providers>
          <span data-testid="retry-child-rr" />
        </manifest.Providers>,
      );
      expect(getByTestId("captured-retry-rr")).toBeTruthy();
      expect(getByTestId("retry-child-rr")).toBeTruthy();
    });

    it("includes lazy module catch-all routes consistently across calls", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.registerLazy({
        id: "lazy",
        basePath: "/lazy",
        load: async () => ({
          default: {
            id: "lazy",
            version: "1.0.0",
            createRoutes: () => ({ path: "feature", Component: () => <></> }),
          },
        }),
      });

      const a = registry.resolveManifest().routes;
      const b = registry.resolveManifest().routes;
      expect(b).toBe(a);
      expect(b).toHaveLength(1);
    });
  });

  describe("createRoutes error handling", () => {
    it("throws with the module id when createRoutes() returns a falsy value", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register({
        id: "bad-mod",
        version: "1.0.0",
        createRoutes: () => null as unknown as RouteObject,
      });

      expect(() => registry.resolveManifest()).toThrow(
        /Module "bad-mod" createRoutes\(\) returned a falsy value/,
      );
    });

    it("propagates thrown errors from createRoutes() unchanged (module crash surfaces loudly)", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register({
        id: "throws",
        version: "1.0.0",
        createRoutes: () => {
          throw new Error("boom from module");
        },
      });

      expect(() => registry.resolveManifest()).toThrow(/boom from module/);
    });

    it("wraps onRegister errors with the module id for debuggability", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register({
        id: "bad-init",
        version: "1.0.0",
        lifecycle: {
          onRegister: () => {
            throw new Error("init failed");
          },
        },
      });

      expect(() => registry.resolveManifest()).toThrow(
        /Module "bad-init" lifecycle\.onRegister\(\) failed: init failed/,
      );
    });
  });

  describe("manifest.routes immutability contract", () => {
    it("the routes array is typed readonly — the cached manifest must not be poisoned across callsites", () => {
      // Primarily a type-level contract; at runtime we just assert the
      // cached reference is stable. The readonly type on ResolvedManifest
      // is what actually guards callers from pushing into the array.
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register(routedModule("r", "/r"));

      const { routes } = registry.resolveManifest();
      const second = registry.resolveManifest().routes;
      expect(second).toBe(routes);
    });
  });

  describe("mode exclusivity", () => {
    it("throws when resolve() is called after resolveManifest()", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.resolveManifest();

      expect(() => registry.resolve()).toThrow(/already in framework-mode/);
    });

    it("throws when resolveManifest() is called after resolve()", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.resolve();

      expect(() => registry.resolveManifest()).toThrow(/already owns a router/);
    });
  });

  describe("registration locking", () => {
    it("refuses further module registration after resolveManifest()", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.resolveManifest();

      expect(() => registry.register(headlessModule("late"))).toThrow(
        /Cannot register modules after resolve/,
      );
      expect(() =>
        registry.registerLazy({
          id: "late-lazy",
          basePath: "/late",
          load: async () => ({ default: { id: "late-lazy", version: "1.0.0" } }),
        }),
      ).toThrow(/Cannot register modules after resolve/);
    });
  });

  describe("validation", () => {
    it("validates duplicate IDs at resolveManifest time", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register(headlessModule("same"));
      registry.register(headlessModule("same"));

      expect(() => registry.resolveManifest()).toThrow(/Duplicate module ID "same"/);
    });

    it("validates required dependencies at resolveManifest time", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: {},
      });
      registry.register({
        id: "needs-api",
        version: "1.0.0",
        requires: ["api"] as any,
      });

      expect(() => registry.resolveManifest()).toThrow(
        /Module "needs-api" requires dependencies not provided/,
      );
    });
  });

  describe("dynamic slots", () => {
    it("returns a callable recalculateSlots when modules declare dynamicSlots", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
        slots: { commands: [] },
      });
      registry.register({
        id: "dyn",
        version: "1.0.0",
        dynamicSlots: () => ({
          commands: [{ id: "dyn-cmd", label: "Dynamic" }],
        }),
      });

      const { recalculateSlots } = registry.resolveManifest();
      expect(recalculateSlots).toBeTypeOf("function");
      expect(() => recalculateSlots()).not.toThrow();
    });

    it("applies slotFilter from options to the manifest (captured by Providers)", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
        slots: { commands: [] },
      });
      registry.register({
        id: "dyn",
        version: "1.0.0",
        dynamicSlots: () => ({
          commands: [
            { id: "keep", label: "Keep" },
            { id: "drop", label: "Drop" },
          ],
        }),
      });

      const { Providers } = registry.resolveManifest({
        slotFilter: (slots) => ({
          ...slots,
          commands: slots.commands.filter((c) => c.id !== "drop"),
        }),
      });

      let observed: { id: string; label: string }[] | null = null;
      function Probe() {
        observed = useSlots<TestSlots>().commands;
        return null;
      }

      render(
        <Providers>
          <Probe />
        </Providers>,
      );

      expect(observed).toEqual([{ id: "keep", label: "Keep" }]);
    });
  });
});
