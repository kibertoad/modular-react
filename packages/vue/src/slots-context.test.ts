import { describe, it, expect } from "vitest";
import { defineComponent, h, shallowRef, type Ref } from "vue";
import { mount } from "@vue/test-utils";
import { createStore } from "@modular-frontend/core";
import {
  createSlotsSignal,
  DynamicSlotsProvider,
  slotsKey,
  useRecalculateSlots,
  useSlots,
} from "./slots-context.js";
import { renderComposable } from "./test-render.js";

describe("useSlots", () => {
  it("returns slots from context", () => {
    const slots = { commands: [{ id: "1" }] };
    const { result } = renderComposable(() => useSlots(), {
      provide: { [slotsKey as symbol]: shallowRef(slots) },
    });
    expect(result().value).toBe(slots);
  });

  it("throws outside provider", () => {
    expect(() => renderComposable(() => useSlots())).toThrow(/useSlots/);
  });
});

describe("useRecalculateSlots", () => {
  it("returns noop by default", () => {
    const { result } = renderComposable(() => useRecalculateSlots());
    expect(result()).toBeTypeOf("function");
    expect(() => result()()).not.toThrow();
  });
});

describe("DynamicSlotsProvider", () => {
  it("evaluates dynamic slots and re-evaluates on signal", () => {
    const authStore = createStore({ isAdmin: false });
    const signal = createSlotsSignal();
    const baseSlots = { commands: [{ id: "static" }] };
    const factory = (deps: any) =>
      deps.auth?.isAdmin ? { commands: [{ id: "admin" }] } : { commands: [] };

    let captured!: Ref<{ commands: any[] }>;
    const Child = defineComponent({
      setup() {
        captured = useSlots<{ commands: any[] }>();
        return () => h("div");
      },
    });

    mount(
      defineComponent({
        setup() {
          return () =>
            h(
              DynamicSlotsProvider,
              {
                baseSlots,
                factories: [factory as any],
                filter: undefined,
                stores: { auth: authStore },
                services: {},
                reactiveServices: {},
                signal,
              },
              { default: () => h(Child) },
            );
        },
      }),
    );

    // Initially not admin — only the static slot.
    expect(captured.value.commands).toEqual([{ id: "static" }]);

    // Become admin and recalculate.
    authStore.setState({ isAdmin: true });
    signal.notify();

    expect(captured.value.commands).toEqual([{ id: "static" }, { id: "admin" }]);
  });
});
