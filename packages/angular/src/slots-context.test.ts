import { describe, expect, it } from "vitest";
import { signal } from "@angular/core";
import { createStore } from "@modular-frontend/core";
import {
  createSlotsSignal,
  injectRecalculateSlots,
  injectSlots,
  provideDynamicSlots,
  provideSlots,
} from "./slots-context.js";
import { renderInContext } from "./test-injector.js";

describe("injectSlots", () => {
  it("returns slots from context", () => {
    const slots = { commands: [{ id: "1" }] };
    const { result } = renderInContext(() => injectSlots(), [provideSlots(slots)]);
    expect(result()).toBe(slots);
  });

  it("accepts an existing signal without re-wrapping", () => {
    const slots = signal({ commands: [{ id: "1" }] }).asReadonly();
    const { result } = renderInContext(
      () => injectSlots<{ commands: unknown[] }>(),
      [provideSlots(slots)],
    );
    expect(result).toBe(slots);
  });

  it("throws outside provider", () => {
    expect(() => renderInContext(() => injectSlots())).toThrow(/injectSlots/);
  });
});

describe("injectRecalculateSlots", () => {
  it("returns noop by default", () => {
    const { result } = renderInContext(() => injectRecalculateSlots());
    expect(result).toBeTypeOf("function");
    expect(() => result()).not.toThrow();
  });
});

describe("provideDynamicSlots", () => {
  it("evaluates dynamic slots and re-evaluates on signal", () => {
    const authStore = createStore({ isAdmin: false });
    const slotsSignal = createSlotsSignal();
    const baseSlots = { commands: [{ id: "static" }] };
    const factory = (deps: any) =>
      deps.auth?.isAdmin ? { commands: [{ id: "admin" }] } : { commands: [] };

    const { result } = renderInContext(
      () => injectSlots<{ commands: any[] }>(),
      [
        provideDynamicSlots({
          baseSlots,
          factories: [factory],
          stores: { auth: authStore },
          services: {},
          reactiveServices: {},
          signal: slotsSignal,
        }),
      ],
    );

    // Initially not admin — only the static slot.
    expect(result().commands).toEqual([{ id: "static" }]);

    // Become admin and recalculate.
    authStore.setState({ isAdmin: true });
    slotsSignal.notify();

    expect(result().commands).toEqual([{ id: "static" }, { id: "admin" }]);
  });
});
