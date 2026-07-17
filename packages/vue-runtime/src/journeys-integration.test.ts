import { describe, it, expect, vi } from "vitest";
import { defineComponent, h, type FunctionalComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter, RouterView, type RouteRecordRaw } from "vue-router";
import { defineEntry, defineExit, schema } from "@modular-frontend/core";
import { defineModule } from "@modular-vue/core";
import {
  defineJourney,
  journeysPlugin,
  JourneyOutlet,
  JourneyProvider,
  useJourneyContext,
} from "@modular-vue/journeys";
import { createRegistry } from "./registry.js";

// PR-32: journeys wired into `@modular-vue/runtime` end-to-end. Proves the
// acceptance scenario — a multi-module journey with a branch, mounted through a
// route, driven to its terminal. The registry's `journeysPlugin()` produces the
// runtime on `manifest.journeys`; `resolveManifest()` threads the plugin's
// `<JourneyProvider>` into the `Providers` stack so a `<JourneyOutlet>` rendered
// inside `<router-view>` reads the runtime from context without the shell wiring
// it by hand. A second block covers the router-owning `resolve()` path, where
// the shell wraps its own `<router-view>` in `<JourneyProvider>`.

// --- A branching, multi-module journey ---------------------------------------

// Entry components are authored as Vue *functional* components (plain
// functions), which satisfy the registry's `validateEntryExitShape` check that
// an entry declares a function `component`. Props are declared on `.props` so
// the outlet's `{ input, exit }` bindings land as `props`.
type ExitFn = (n: string, o?: unknown) => void;

const chooserExits = { pickA: defineExit(), pickB: defineExit() } as const;

const Chooser: FunctionalComponent<{ input: Record<string, never>; exit: ExitFn }> = (props) =>
  h("div", { class: "chooser" }, [
    h("button", { "data-testid": "pick-a", onClick: () => props.exit("pickA") }, "A"),
    h("button", { "data-testid": "pick-b", onClick: () => props.exit("pickB") }, "B"),
  ]);
Chooser.props = ["input", "exit", "goBack", "goForward"];

const chooser = defineModule({
  id: "chooser",
  version: "1.0.0",
  exitPoints: chooserExits,
  entryPoints: {
    choose: defineEntry({ component: Chooser as never, input: schema<Record<string, never>>() }),
  },
});

function finishModule(id: string, label: string) {
  const exits = { done: defineExit() } as const;
  const Finish: FunctionalComponent<{ input: { via: string }; exit: ExitFn }> = (props) =>
    h("div", { class: `finish-${id}` }, [
      h("span", { "data-testid": "arrived" }, `arrived:${props.input.via}`),
      h(
        "button",
        { "data-testid": `done-${id}`, onClick: () => props.exit("done") },
        `finish ${label}`,
      ),
    ]);
  Finish.props = ["input", "exit", "goBack", "goForward"];
  return defineModule({
    id,
    version: "1.0.0",
    exitPoints: exits,
    entryPoints: {
      confirm: defineEntry({ component: Finish as never, input: schema<{ via: string }>() }),
    },
  });
}

const finishA = finishModule("a", "A");
const finishB = finishModule("b", "B");

type Modules = {
  readonly chooser: typeof chooser;
  readonly a: typeof finishA;
  readonly b: typeof finishB;
};

const wizard = defineJourney<Modules, Record<string, never>, { via: string }>()({
  id: "wizard",
  version: "1.0.0",
  initialState: () => ({}),
  start: () => ({ module: "chooser", entry: "choose", input: {} }),
  transitions: {
    chooser: {
      choose: {
        pickA: () => ({ next: { module: "a", entry: "confirm", input: { via: "A" } } }),
        pickB: () => ({ next: { module: "b", entry: "confirm", input: { via: "B" } } }),
      },
    },
    a: { confirm: { done: () => ({ complete: { via: "A" } }) } },
    b: { confirm: { done: () => ({ complete: { via: "B" } }) } },
  },
});

function newRegistry() {
  const registry = createRegistry({}).use(journeysPlugin());
  registry.register(chooser);
  registry.register(finishA);
  registry.register(finishB);
  registry.registerJourney(wizard);
  return registry;
}

describe("journeys via resolveManifest() — route integration", () => {
  it("mounts a branching journey through a route and drives it to its terminal", async () => {
    const registry = newRegistry();
    const manifest = registry.resolveManifest();

    const onFinished = vi.fn();

    // A route that launches and hosts the journey. The outlet reads the runtime
    // from the journey context threaded by `resolveManifest()` — no `runtime`
    // prop, no hand-wired `<JourneyProvider>`.
    const WizardRoute = defineComponent({
      name: "WizardRoute",
      setup() {
        const ctx = useJourneyContext();
        if (!ctx) throw new Error("expected journey context");
        const instanceId = ctx.runtime.start("wizard", {});
        return () => h(JourneyOutlet, { instanceId, onFinished });
      },
    });

    const routes: RouteRecordRaw[] = [{ path: "/wizard", name: "wizard", component: WizardRoute }];
    const router = createRouter({ history: createMemoryHistory(), routes });

    const Root = defineComponent({
      name: "Root",
      setup() {
        return () => h(manifest.Providers, null, () => h(RouterView));
      },
    });

    await router.push("/wizard");
    const wrapper = mount(Root, { global: { plugins: [router] } });
    await router.isReady();
    await flushPromises();

    // Step 1: the chooser step renders.
    expect(wrapper.find(".chooser").exists()).toBe(true);

    // Branch B: pick B, land on finish-b, and complete.
    await wrapper.find('[data-testid="pick-b"]').trigger("click");
    await flushPromises();
    expect(wrapper.find(".finish-b").exists()).toBe(true);
    expect(wrapper.find('[data-testid="arrived"]').text()).toBe("arrived:B");

    await wrapper.find('[data-testid="done-b"]').trigger("click");
    await flushPromises();

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0][0]).toMatchObject({
      status: "completed",
      payload: { via: "B" },
      journeyId: "wizard",
    });
  });

  it("drives the other branch to a distinct terminal payload", async () => {
    const registry = newRegistry();
    const manifest = registry.resolveManifest();
    const onFinished = vi.fn();

    const WizardRoute = defineComponent({
      name: "WizardRoute",
      setup() {
        const ctx = useJourneyContext();
        if (!ctx) throw new Error("expected journey context");
        const instanceId = ctx.runtime.start("wizard", {});
        return () => h(JourneyOutlet, { instanceId, onFinished });
      },
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/wizard", name: "wizard", component: WizardRoute }],
    });
    const Root = defineComponent({
      name: "Root",
      setup: () => () => h(manifest.Providers, null, () => h(RouterView)),
    });

    await router.push("/wizard");
    const wrapper = mount(Root, { global: { plugins: [router] } });
    await router.isReady();
    await flushPromises();

    await wrapper.find('[data-testid="pick-a"]').trigger("click");
    await flushPromises();
    expect(wrapper.find(".finish-a").exists()).toBe(true);
    expect(wrapper.find('[data-testid="arrived"]').text()).toBe("arrived:A");

    await wrapper.find('[data-testid="done-a"]').trigger("click");
    await flushPromises();

    expect(onFinished.mock.calls[0][0]).toMatchObject({
      status: "completed",
      payload: { via: "A" },
    });
  });
});

describe("journeys via resolve() — shell-wrapped context", () => {
  it("wires the journey context by wrapping <router-view> in <JourneyProvider>", async () => {
    const registry = newRegistry();

    const onFinished = vi.fn();
    const WizardRoute = defineComponent({
      name: "WizardRoute",
      setup() {
        const ctx = useJourneyContext();
        if (!ctx) throw new Error("expected journey context");
        const instanceId = ctx.runtime.start("wizard", {});
        return () => h(JourneyOutlet, { instanceId, onFinished });
      },
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/wizard", name: "wizard", component: WizardRoute }],
    });
    const manifest = registry.resolve({ router });

    // The router-owning path returns an installable plugin; the shell owns the
    // root and wraps its own <router-view> in <JourneyProvider>, reading the
    // runtime off `manifest.journeys`.
    const Root = defineComponent({
      name: "Root",
      setup() {
        return () => h(JourneyProvider, { runtime: manifest.journeys }, () => h(RouterView));
      },
    });

    await router.push("/wizard");
    const wrapper = mount(Root, { global: { plugins: [router, manifest] } });
    await router.isReady();
    await flushPromises();

    expect(wrapper.find(".chooser").exists()).toBe(true);

    await wrapper.find('[data-testid="pick-b"]').trigger("click");
    await flushPromises();
    await wrapper.find('[data-testid="done-b"]').trigger("click");
    await flushPromises();

    expect(onFinished.mock.calls[0][0]).toMatchObject({
      status: "completed",
      payload: { via: "B" },
    });
  });
});
