import { defineComponent, h, nextTick, type PropType } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import { preloadEntry } from "@modular-vue/vue";
import { ModuleTab } from "./module-tab.js";

const exits = { confirmed: defineExit<{ id: string }>(), cancelled: defineExit() } as const;

const Review = defineComponent({
  name: "Review",
  props: {
    input: { type: Object as PropType<{ customerId: string }>, default: undefined },
    exit: { type: Function as PropType<(name: string, output?: unknown) => void>, required: true },
  },
  setup(props) {
    return () =>
      h("div", [
        h("span", { "data-testid": "cid" }, props.input?.customerId),
        h(
          "button",
          {
            "data-testid": "confirm",
            onClick: () => props.exit("confirmed", { id: props.input?.customerId }),
          },
          "confirm",
        ),
        h("button", { "data-testid": "cancel", onClick: () => props.exit("cancelled") }, "cancel"),
      ]);
  },
});

const mod = defineModule({
  id: "review",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    review: defineEntry({
      component: Review as never,
      input: schema<{ customerId: string }>(),
    }),
  },
});

describe("ModuleTab", () => {
  it("renders the named entry with input and threads exits to onExit", async () => {
    const onExit = vi.fn();
    const wrapper = mount(ModuleTab, {
      props: { module: mod, entry: "review", input: { customerId: "C-1" }, tabId: "t1", onExit },
    });
    expect(wrapper.get('[data-testid="cid"]').text()).toBe("C-1");

    await wrapper.get('[data-testid="confirm"]').trigger("click");
    expect(onExit).toHaveBeenCalledWith({
      moduleId: "review",
      entry: "review",
      exit: "confirmed",
      output: { id: "C-1" },
      tabId: "t1",
    });
  });

  it("falls back to module.component when no entry matches", () => {
    const Legacy = defineComponent({
      name: "Legacy",
      props: { input: { type: Object as PropType<{ tag: string }>, default: undefined } },
      setup(props) {
        return () => h("div", { "data-testid": "legacy" }, props.input?.tag ?? "no-input");
      },
    });
    const legacyMod = defineModule({
      id: "legacy",
      version: "1.0.0",
      component: Legacy as never,
    });
    const wrapper = mount(ModuleTab, { props: { module: legacyMod, input: { tag: "hi" } } });
    expect(wrapper.get('[data-testid="legacy"]').text()).toBe("hi");
  });

  it("renders a disambiguation notice when the entry prop is omitted on a multi-entry module", () => {
    const multiMod = defineModule({
      id: "multi",
      version: "1.0.0",
      exitPoints: exits,
      entryPoints: {
        review: defineEntry({
          component: Review as never,
          input: schema<{ customerId: string }>(),
        }),
        other: defineEntry({ component: Review as never, input: schema<{ customerId: string }>() }),
      },
    });
    const wrapper = mount(ModuleTab, { props: { module: multiMod } });
    expect(wrapper.text()).toMatch(/exposes multiple entries/);
    expect(wrapper.text()).toMatch(/review, other/);
  });

  it("renders an error notice when the entry prop names an unknown entry", () => {
    const wrapper = mount(ModuleTab, {
      props: { module: mod, entry: "ghost", input: { customerId: "C-miss" } },
    });
    expect(wrapper.text()).toMatch(/no entry "ghost"/);
    expect(wrapper.text()).toMatch(/review/);
  });

  it("surfaces a notice instead of the legacy component when entry is passed to a module with no entry points", () => {
    const Legacy = defineComponent({
      name: "LegacyMarker",
      setup() {
        return () => h("div", { "data-testid": "legacy-marker" }, "legacy");
      },
    });
    const legacyMod = defineModule({
      id: "legacy-only",
      version: "1.0.0",
      component: Legacy as never,
    });
    const wrapper = mount(ModuleTab, {
      props: { module: legacyMod, entry: "review", input: { tag: "hi" } },
    });
    // An explicit `entry` prop is an opt-in to the entry contract; silently
    // falling through to the legacy component would hide the misconfiguration.
    expect(wrapper.text()).toMatch(/has no entry points/);
    expect(wrapper.find('[data-testid="legacy-marker"]').exists()).toBe(false);
  });

  it("renders a missing-input notice when the caller forgets `input` on an entry-backed module", () => {
    // The caller omitted `input` entirely — not the same as explicitly passing
    // `input={undefined}`. Without this guard the review component would blow up
    // on `input.customerId`; the notice tells the author exactly what to fix.
    const wrapper = mount(ModuleTab, { props: { module: mod, entry: "review" } });
    expect(wrapper.text()).toMatch(/was rendered without an `input` prop/);
    expect(wrapper.find('[data-testid="cid"]').exists()).toBe(false);
  });

  it("still renders the entry when the caller explicitly passes `input={undefined}` (void-input entries)", () => {
    const voidExits = { done: defineExit() } as const;
    const VoidEntry = defineComponent({
      name: "VoidEntry",
      props: {
        exit: { type: Function as PropType<(name: string) => void>, required: true },
      },
      setup(props) {
        return () =>
          h("div", [
            h("span", { "data-testid": "void-marker" }, "ready"),
            h("button", { "data-testid": "go", onClick: () => props.exit("done") }, "go"),
          ]);
      },
    });
    const voidMod = defineModule({
      id: "void-mod",
      version: "1.0.0",
      exitPoints: voidExits,
      entryPoints: {
        main: defineEntry({ component: VoidEntry as never, input: schema<void>() }),
      },
    });
    const wrapper = mount(ModuleTab, { props: { module: voidMod, input: undefined } });
    expect(wrapper.find('[data-testid="void-marker"]').exists()).toBe(true);
  });

  it("renders a lazy entry — fallback first, resolved component after the chunk loads", async () => {
    let resolveImport!: (mod: { default: typeof Review }) => void;
    const lazyImporter = vi.fn(
      () =>
        new Promise<{ default: typeof Review }>((res) => {
          resolveImport = res;
        }),
    );
    const lazyMod = defineModule({
      id: "review-lazy",
      version: "1.0.0",
      exitPoints: exits,
      entryPoints: {
        review: defineEntry({
          lazy: lazyImporter,
          fallback: (() => h("span", { "data-testid": "lazy-fallback" }, "loading…")) as never,
          input: schema<{ customerId: string }>(),
        }),
      },
    });
    const wrapper = mount(ModuleTab, {
      props: { module: lazyMod, entry: "review", input: { customerId: "C-9" } },
    });
    expect(wrapper.find('[data-testid="lazy-fallback"]').exists()).toBe(true);
    expect(lazyImporter).toHaveBeenCalledTimes(1);
    resolveImport({ default: Review });
    await flushPromises();
    await nextTick();
    expect(wrapper.get('[data-testid="cid"]').text()).toBe("C-9");
  });

  it("after preloadEntry, a lazy entry replays from the cache without re-importing", async () => {
    // Vue's `defineAsyncComponent` always resolves through its own async state
    // on mount (the React synchronous-thenable "no fallback flash" trick is
    // N/A). What the preload buys is the shared cache: the importer fires once
    // across the preload and the subsequent render.
    const lazyImporter = vi.fn(() => Promise.resolve({ default: Review }));
    const lazyMod = defineModule({
      id: "review-lazy-eager",
      version: "1.0.0",
      exitPoints: exits,
      entryPoints: {
        review: defineEntry({
          lazy: lazyImporter,
          input: schema<{ customerId: string }>(),
        }),
      },
    });

    await preloadEntry(lazyMod.entryPoints!.review);
    expect(lazyImporter).toHaveBeenCalledTimes(1);

    const wrapper = mount(ModuleTab, {
      props: { module: lazyMod, entry: "review", input: { customerId: "C-42" } },
    });
    await flushPromises();
    await nextTick();
    expect(wrapper.get('[data-testid="cid"]').text()).toBe("C-42");
    // The mount reused the preloaded chunk — no second import.
    expect(lazyImporter).toHaveBeenCalledTimes(1);
  });
});
