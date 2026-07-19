import { describe, it, expectTypeOf } from "vitest";
import { createApp } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { createStore, type RegistryPlugin } from "@modular-frontend/core";
import { createRegistry, type ApplicationManifest } from "@modular-vue/runtime";
import { installModularApp, type InstallModularAppOptions, type NuxtAppLike } from "./install.js";

interface Deps {
  auth: { user: string | null };
}
interface Slots {
  commands: { id: string; label: string }[];
  [key: string]: readonly unknown[];
}

// A minimal stand-in for a runtime-contributing plugin (shaped like the real
// journeys plugin) so this package can assert extension threading without a
// dependency on `@modular-vue/journeys`.
interface FakeJourneyRuntime {
  start(id: string): string;
}
type FakeJourneysPlugin = RegistryPlugin<
  "journeys",
  { registerJourney(def: unknown): void },
  FakeJourneyRuntime
>;
declare const fakeJourneysPlugin: () => FakeJourneysPlugin;

describe("installModularApp types", () => {
  it("returns an ApplicationManifest typed by the registry generics", () => {
    const registry = createRegistry<Deps, Slots>({
      stores: { auth: createStore<Deps["auth"]>({ user: null }) },
      slots: { commands: [] },
    });
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const nuxtApp: NuxtAppLike = { vueApp: createApp({}), $router: router };

    const manifest = installModularApp(nuxtApp, registry);
    expectTypeOf(manifest).toMatchTypeOf<ApplicationManifest<Slots>>();
    expectTypeOf(manifest.slots).toMatchTypeOf<Slots>();
  });

  it("types the slotFilter over the registry's deps and slots", () => {
    expectTypeOf<InstallModularAppOptions<Deps, Slots>["slotFilter"]>().toMatchTypeOf<
      ((slots: Slots, deps: Deps) => Slots) | undefined
    >();
  });

  it("carries plugin extensions through to the manifest without a cast", () => {
    // The plugin tuple is inferred from the registry, so `manifest.extensions`
    // and the `manifest.journeys` convenience alias are typed against the
    // plugin's runtime rather than collapsing to `Record<string, unknown>` /
    // `unknown`. This is the fix for the "installModularApp erases plugin
    // extension types" feedback.
    const registry = createRegistry<Deps, Slots>({
      stores: { auth: createStore<Deps["auth"]>({ user: null }) },
      slots: { commands: [] },
    }).use(fakeJourneysPlugin());
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const nuxtApp: NuxtAppLike = { vueApp: createApp({}), $router: router };

    const manifest = installModularApp(nuxtApp, registry);

    expectTypeOf(manifest.journeys).toEqualTypeOf<FakeJourneyRuntime>();
    expectTypeOf(manifest.extensions.journeys).toEqualTypeOf<FakeJourneyRuntime>();
    // Not `unknown` — the regression the feedback hit was `manifest.journeys`
    // widening to `unknown` and forcing `manifest.journeys as JourneyRuntime`.
    expectTypeOf(manifest.journeys).not.toBeUnknown();
  });
});
