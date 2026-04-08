import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createStore } from "@modular-react/core";
import {
  SlotsContext,
  useSlots,
  useRecalculateSlots,
  DynamicSlotsProvider,
  createSlotsSignal,
} from "./slots-context.js";

describe("useSlots", () => {
  it("returns slots from context", () => {
    const slots = { commands: [{ id: "1" }] };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SlotsContext value={slots}>{children}</SlotsContext>
    );
    const { result } = renderHook(() => useSlots(), { wrapper });
    expect(result.current).toBe(slots);
  });

  it("throws outside provider", () => {
    expect(() => renderHook(() => useSlots())).toThrow(/useSlots/);
  });
});

describe("useRecalculateSlots", () => {
  it("returns noop by default", () => {
    const { result } = renderHook(() => useRecalculateSlots());
    expect(result.current).toBeTypeOf("function");
    expect(() => result.current()).not.toThrow();
  });
});

describe("DynamicSlotsProvider", () => {
  it("evaluates dynamic slots and re-evaluates on signal", () => {
    const authStore = createStore({ isAdmin: false });
    const signal = createSlotsSignal();
    const baseSlots = { commands: [{ id: "static" }] };
    const factory = (deps: any) =>
      deps.auth?.isAdmin ? { commands: [{ id: "admin" }] } : { commands: [] };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DynamicSlotsProvider
        baseSlots={baseSlots}
        factories={[factory as any]}
        filter={undefined}
        stores={{ auth: authStore }}
        services={{}}
        reactiveServices={{}}
        signal={signal}
      >
        {children}
      </DynamicSlotsProvider>
    );

    const { result } = renderHook(() => useSlots<{ commands: any[] }>(), { wrapper });

    // Initially not admin — only static slot
    expect(result.current.commands).toEqual([{ id: "static" }]);

    // Become admin and recalculate
    act(() => {
      authStore.setState({ isAdmin: true });
      signal.notify();
    });

    expect(result.current.commands).toEqual([{ id: "static" }, { id: "admin" }]);
  });
});
