import { describe, it, expect, vi } from "vitest";
import { defineComponent, h, type PropType } from "vue";
import { mount } from "@vue/test-utils";

import {
  ModuleExitProvider,
  useModuleExit,
  useModuleExitDispatcher,
  type ModuleExitHandler,
} from "./module-exit.js";
import { renderComposable } from "./test-render.js";

const Trigger = defineComponent({
  props: {
    moduleId: { type: String, required: true },
    entry: { type: String, required: true },
    exitName: { type: String, required: true },
    output: { type: null as unknown as PropType<unknown>, default: undefined },
    tabId: { type: String, default: undefined },
    localOnExit: { type: Function as PropType<ModuleExitHandler>, default: undefined },
  },
  setup(props) {
    const exit = useModuleExit(props.moduleId, props.entry, {
      tabId: props.tabId,
      localOnExit: props.localOnExit,
    });
    return () =>
      h(
        "button",
        {
          "data-testid": "fire",
          onClick: () => exit(props.exitName as never, props.output as never),
        },
        "fire",
      );
  },
});

describe("ModuleExitProvider / useModuleExit", () => {
  it("delivers exits to the provider-level dispatcher", async () => {
    const onExit = vi.fn();
    const wrapper = mount(ModuleExitProvider, {
      props: { onExit },
      slots: {
        default: () =>
          h(Trigger, {
            moduleId: "m1",
            entry: "default",
            exitName: "confirmed",
            output: { id: 7 },
          }),
      },
    });
    await wrapper.get("[data-testid=fire]").trigger("click");
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith({
      moduleId: "m1",
      entry: "default",
      exit: "confirmed",
      output: { id: 7 },
      tabId: undefined,
      routeId: undefined,
    });
  });

  it("fires the local onExit before the provider dispatcher", async () => {
    const order: string[] = [];
    const globalOnExit = vi.fn(() => {
      order.push("global");
    });
    const localOnExit = vi.fn(() => {
      order.push("local");
    });
    const wrapper = mount(ModuleExitProvider, {
      props: { onExit: globalOnExit },
      slots: {
        default: () =>
          h(Trigger, { moduleId: "m1", entry: "default", exitName: "cancelled", localOnExit }),
      },
    });
    await wrapper.get("[data-testid=fire]").trigger("click");
    expect(order).toEqual(["local", "global"]);
    expect(localOnExit).toHaveBeenCalledTimes(1);
    expect(globalOnExit).toHaveBeenCalledTimes(1);
  });

  it("threads tabId through the event when provided", async () => {
    const onExit = vi.fn();
    const wrapper = mount(ModuleExitProvider, {
      props: { onExit },
      slots: {
        default: () =>
          h(Trigger, { moduleId: "m1", entry: "default", exitName: "done", tabId: "tab-42" }),
      },
    });
    await wrapper.get("[data-testid=fire]").trigger("click");
    expect(onExit).toHaveBeenCalledWith(expect.objectContaining({ tabId: "tab-42" }));
  });

  it("is a safe no-op when no provider is mounted", async () => {
    const wrapper = mount(Trigger, {
      props: { moduleId: "m1", entry: "default", exitName: "done" },
    });
    await expect(wrapper.get("[data-testid=fire]").trigger("click")).resolves.not.toThrow();
  });

  it("useModuleExitDispatcher returns undefined without a provider", () => {
    const { result } = renderComposable(() => useModuleExitDispatcher());
    expect(result()).toBeUndefined();
  });

  it("useModuleExitDispatcher exposes the registered handler", () => {
    const onExit: ModuleExitHandler = () => {};
    let seen: unknown = null;
    const Reader = defineComponent({
      setup() {
        seen = useModuleExitDispatcher();
        return () => h("div");
      },
    });
    mount(ModuleExitProvider, {
      props: { onExit },
      slots: { default: () => h(Reader) },
    });
    expect(seen).toBe(onExit);
  });
});
