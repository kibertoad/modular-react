import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { createStore } from "zustand/vanilla";
import { createRoute } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { useNavigation, useSlots, useModules } from "@modular-react/react";
import { createRegistry } from "./registry.js";

/**
 * `resolveManifest()` is the framework-mode entry point — the host (e.g.
 * `@tanstack/router-plugin` file-based mode, or TanStack Start) owns
 * routing, so the registry produces a `Providers` component but does NOT
 * create a router.
 *
 * These tests exercise real behavior from a framework-mode consumer's
 * perspective: does `Providers` deliver navigation / slots / modules to the
 * hooks the host's components will call? Does it stay consistent across
 * multiple resolution sites? Does it refuse to let you mix router-owning
 * and framework modes?
 *
 * Note: unlike React Router, TanStack module routes are bound to a parent
 * at `createRoute` time via `getParentRoute`, so there's no `routes` field
 * on the manifest. `createRoutes` is silently ignored in framework mode —
 * see `ResolvedManifest` JSDoc for the rationale.
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
    createRoutes: (parent: AnyRoute) =>
      createRoute({ getParentRoute: () => parent, path, component: () => <></> }),
  };
}

describe("resolveManifest (framework mode)", () => {
  describe("shape", () => {
    it("returns Providers, navigation, slots, modules, recalculateSlots", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register(headlessModule("m", { navigation: true, slots: true }));

      const manifest = registry.resolveManifest();

      expect(manifest.Providers).toBeTypeOf("function");
      expect(manifest.navigation.items).toHaveLength(1);
      expect(manifest.slots.commands).toHaveLength(1);
      expect(manifest.modules).toHaveLength(1);
      expect(manifest.recalculateSlots).toBeTypeOf("function");
    });

    it("silently ignores module createRoutes() — route shape lives in the host's file-based tree", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register(routedModule("a", "/a"));
      registry.register(routedModule("b", "/b"));
      registry.register(headlessModule("c", { navigation: true }));

      const manifest = registry.resolveManifest();

      // No routes field on the manifest, but the other contributions still flow.
      expect(manifest).not.toHaveProperty("routes");
      expect(manifest.modules.map((m) => m.id)).toEqual(["a", "b", "c"]);
      expect(manifest.navigation.items).toHaveLength(1);
    });

    it("does not invoke createRoutes() in framework mode — host composes routes", () => {
      const createRoutes = vi.fn();
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register({ id: "m", version: "1.0.0", createRoutes });

      registry.resolveManifest();

      expect(createRoutes).not.toHaveBeenCalled();
    });

    it("throws when lazy modules are registered — no parent to attach a catch-all to", () => {
      // Lazy modules only contribute routes under a parent; in framework
      // mode the host owns composition, so there's nowhere to graft them.
      // Silently dropping them would ship a manifest that's missing every
      // lazy-module route with no feedback — throw loudly instead.
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.registerLazy({
        id: "billing-lazy",
        basePath: "/billing",
        load: async () => ({ default: { id: "billing-lazy", version: "1.0.0" } }),
      });

      expect(() => registry.resolveManifest()).toThrow(
        /resolveManifest\(\) does not support lazy modules[\s\S]*billing-lazy/,
      );
    });

    it("lists every lazy module id in the error so the user can find them", () => {
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.registerLazy({
        id: "a",
        basePath: "/a",
        load: async () => ({ default: { id: "a", version: "1.0.0" } }),
      });
      registry.registerLazy({
        id: "b",
        basePath: "/b",
        load: async () => ({ default: { id: "b", version: "1.0.0" } }),
      });

      expect(() => registry.resolveManifest()).toThrow(/a, b/);
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
    it("returns the same manifest object across calls (shared registry module pattern)", () => {
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
      // Sub-collections are captured in closure on the Providers component,
      // so downstream readers depending on reference equality (memoization,
      // deps arrays) get stable identity.
      expect(second.modules).toBe(first.modules);
      expect(second.navigation).toBe(first.navigation);
      expect(second.slots).toBe(first.slots);
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
      // from a module's onRegister (after earlier hooks already ran), a
      // retry must not re-walk the hooks — modules commonly subscribe to
      // stores or register side-effects against framework singletons in
      // onRegister, and double-firing would double-register those.
      //
      // After the throw, `onRegisterRan` flips to true, so the retry skips
      // the loop entirely. The retry then completes successfully with a
      // manifest reflecting the modules' navigation/slots/etc. — "bad"'s
      // onRegister never re-fires, and "good"'s onRegister fires exactly
      // once across both calls.
      const onRegisterGood = vi.fn();
      const onRegisterBad = vi.fn(() => {
        throw new Error("boom");
      });
      const registry = createRegistry<TestDeps, TestSlots>({
        stores: { auth: createAuthStore() },
        services: { api: { baseUrl: "http://test" } },
      });
      registry.register({
        id: "good",
        version: "1.0.0",
        lifecycle: { onRegister: onRegisterGood },
      });
      registry.register({
        id: "bad",
        version: "1.0.0",
        lifecycle: { onRegister: onRegisterBad },
      });

      expect(() => registry.resolveManifest()).toThrow(
        /Module "bad" lifecycle\.onRegister\(\) failed: boom/,
      );
      // Retry: the loop is skipped entirely. Neither hook fires a second time.
      expect(() => registry.resolveManifest()).not.toThrow();
      expect(onRegisterGood).toHaveBeenCalledOnce();
      expect(onRegisterBad).toHaveBeenCalledOnce();
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
