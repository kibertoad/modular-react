import { describe, it, expect, vi } from "vitest";
import { defineComponent, h, type PropType } from "vue";
import { mount } from "@vue/test-utils";
import { defineEntry, defineExit, defineModule, schema, type ExitFn } from "@modular-frontend/core";

import { ModuleExitProvider } from "./module-exit.js";
import { ModuleRoute } from "./module-route.js";

const exits = { confirmed: defineExit<{ id: string }>(), cancelled: defineExit() } as const;

const Review = defineComponent({
  props: {
    input: { type: Object as PropType<{ customerId: string }>, required: true },
    exit: { type: Function as PropType<ExitFn<typeof exits>>, required: true },
    goBack: { type: Function as PropType<() => void>, default: undefined },
  },
  setup(props) {
    return () =>
      h("div", [
        h("span", { "data-testid": "cid" }, props.input.customerId),
        h(
          "button",
          {
            "data-testid": "confirm",
            onClick: () => props.exit("confirmed", { id: props.input.customerId }),
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
      component: Review,
      input: schema<{ customerId: string }>(),
    }),
  },
});

describe("ModuleRoute", () => {
  it("renders the named entry with input and threads exits to the local onExit", async () => {
    const onExit = vi.fn();
    const wrapper = mount(ModuleRoute, {
      props: { module: mod, entry: "review", input: { customerId: "C-1" }, routeId: "r1", onExit },
    });
    expect(wrapper.get("[data-testid=cid]").text()).toBe("C-1");

    await wrapper.get("[data-testid=confirm]").trigger("click");
    expect(onExit).toHaveBeenCalledWith({
      moduleId: "review",
      entry: "review",
      exit: "confirmed",
      output: { id: "C-1" },
      tabId: undefined,
      routeId: "r1",
    });
  });

  it("forwards exits to a ModuleExitProvider above it", async () => {
    const providerOnExit = vi.fn();
    const wrapper = mount(ModuleExitProvider, {
      props: { onExit: providerOnExit },
      slots: {
        default: () =>
          h(ModuleRoute, { module: mod, entry: "review", input: { customerId: "C-2" } }),
      },
    });

    await wrapper.get("[data-testid=confirm]").trigger("click");
    expect(providerOnExit).toHaveBeenCalledTimes(1);
    expect(providerOnExit).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: "review",
        entry: "review",
        exit: "confirmed",
        output: { id: "C-2" },
      }),
    );
  });

  it("fires the local onExit prop before the provider dispatcher", async () => {
    const order: string[] = [];
    const providerOnExit = vi.fn(() => {
      order.push("provider");
    });
    const localOnExit = vi.fn(() => {
      order.push("local");
    });
    const wrapper = mount(ModuleExitProvider, {
      props: { onExit: providerOnExit },
      slots: {
        default: () =>
          h(ModuleRoute, {
            module: mod,
            entry: "review",
            input: { customerId: "C-3" },
            onExit: localOnExit,
          }),
      },
    });

    await wrapper.get("[data-testid=cancel]").trigger("click");
    expect(order).toEqual(["local", "provider"]);
  });

  it("auto-resolves the single entry when `entry` is omitted", () => {
    const wrapper = mount(ModuleRoute, {
      props: { module: mod, input: { customerId: "C-auto" } },
    });
    expect(wrapper.get("[data-testid=cid]").text()).toBe("C-auto");
  });

  it("renders an error notice when the entry prop names an unknown entry", () => {
    const wrapper = mount(ModuleRoute, {
      props: { module: mod, entry: "ghost", input: { customerId: "C-miss" } },
    });
    expect(wrapper.text()).toContain('no entry "ghost"');
    expect(wrapper.text()).toContain("review");
  });

  it("renders a disambiguation notice when multiple entries exist and `entry` is omitted", () => {
    const multiMod = defineModule({
      id: "multi",
      version: "1.0.0",
      exitPoints: exits,
      entryPoints: {
        review: defineEntry({ component: Review, input: schema<{ customerId: string }>() }),
        other: defineEntry({ component: Review, input: schema<{ customerId: string }>() }),
      },
    });
    const wrapper = mount(ModuleRoute, { props: { module: multiMod } });
    expect(wrapper.text()).toContain("exposes multiple entries");
    expect(wrapper.text()).toContain("review, other");
  });

  it("surfaces a notice instead of the legacy component when entry is passed to a module with no entry points", () => {
    const Legacy = defineComponent({
      setup: () => () => h("div", { "data-testid": "legacy-marker" }, "legacy"),
    });
    const legacyMod = defineModule({ id: "legacy-only", version: "1.0.0", component: Legacy });
    const wrapper = mount(ModuleRoute, {
      props: { module: legacyMod, entry: "review", input: { tag: "hi" } },
    });
    expect(wrapper.text()).toContain("has no entry points");
    expect(wrapper.find("[data-testid=legacy-marker]").exists()).toBe(false);
  });

  it("falls back to module.component when no entry points exist and `entry` is omitted", () => {
    const Legacy = defineComponent({
      props: { input: { type: Object as PropType<{ tag: string }>, default: undefined } },
      setup: (props) => () => h("div", { "data-testid": "legacy" }, props.input?.tag ?? "no-input"),
    });
    const legacyMod = defineModule({ id: "legacy", version: "1.0.0", component: Legacy });
    const wrapper = mount(ModuleRoute, {
      props: { module: legacyMod, input: { tag: "hi" } },
    });
    expect(wrapper.get("[data-testid=legacy]").text()).toBe("hi");
  });

  it("passes a goBack handler through when supplied", async () => {
    const goBack = vi.fn();
    const BackAware = defineComponent({
      props: {
        input: { type: Object as PropType<{ customerId: string }>, required: true },
        exit: { type: Function as PropType<ExitFn<typeof exits>>, required: true },
        goBack: { type: Function as PropType<() => void>, default: undefined },
      },
      setup: (props) => () =>
        h("button", { "data-testid": "back", onClick: () => props.goBack?.() }, "back"),
    });
    const backMod = defineModule({
      id: "back-aware",
      version: "1.0.0",
      exitPoints: exits,
      entryPoints: {
        review: defineEntry({ component: BackAware, input: schema<{ customerId: string }>() }),
      },
    });
    const wrapper = mount(ModuleRoute, {
      props: { module: backMod, entry: "review", input: { customerId: "C-back" }, goBack },
    });
    await wrapper.get("[data-testid=back]").trigger("click");
    expect(goBack).toHaveBeenCalledTimes(1);
  });
});
