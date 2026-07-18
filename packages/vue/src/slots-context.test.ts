import { describe, it, expect } from "vitest";
import { defineComponent, h, ref, shallowRef, type ComputedRef, type Ref } from "vue";
import { mount } from "@vue/test-utils";
import { createStore } from "@modular-frontend/core";
import {
  createSlotsSignal,
  DynamicSlotsProvider,
  reactiveSlotsKey,
  resolveReactiveSlots,
  slotsKey,
  useReactiveSlots,
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

describe("resolveReactiveSlots", () => {
  it("re-evaluates dynamic slots on a reactive change with no recalculate signal", () => {
    const isAdmin = ref(false);
    // A plain service whose getter reads a reactive ref: reading it inside the
    // evaluation `computed` tracks the ref, so no recalculateSlots() is needed.
    const gates = {
      get isAdmin() {
        return isAdmin.value;
      },
    };
    const factory = (deps: any) =>
      deps.gates?.isAdmin ? { commands: [{ id: "admin" }] } : { commands: [] };

    const slots = resolveReactiveSlots({
      baseSlots: { commands: [{ id: "static" }] },
      factories: [factory],
      filter: undefined,
      stores: {},
      services: { gates },
      reactiveServices: {},
    }) as ComputedRef<{ commands: { id: string }[] }>;

    expect(slots.value.commands).toEqual([{ id: "static" }]);

    // Flip the reactive source only — the computed recomputes on next read.
    isAdmin.value = true;
    expect(slots.value.commands).toEqual([{ id: "static" }, { id: "admin" }]);
  });

  it("applies a reactive slotFilter (RBAC-style gating)", () => {
    const canWrite = ref(true);
    const gates = {
      get canWrite() {
        return canWrite.value;
      },
    };
    const filter = (slots: any, deps: any) => ({
      nav: (slots.nav as { id: string; gate?: string }[]).filter(
        (i) => i.gate == null || deps.gates?.[i.gate],
      ),
    });

    const slots = resolveReactiveSlots({
      baseSlots: { nav: [{ id: "always" }, { id: "guarded", gate: "canWrite" }] },
      factories: [],
      filter,
      stores: {},
      services: { gates },
      reactiveServices: {},
    }) as ComputedRef<{ nav: { id: string }[] }>;

    expect(slots.value.nav.map((i) => i.id)).toEqual(["always", "guarded"]);

    // Revoke the permission — the guarded item drops with no signal fired.
    canWrite.value = false;
    expect(slots.value.nav.map((i) => i.id)).toEqual(["always"]);
  });

  it("tracks a reactive source read through a reactiveService getSnapshot", () => {
    const isAdmin = ref(false);
    // A reactiveService whose getSnapshot() reads reactive state: the snapshot is
    // rebuilt inside the computed (buildDepsSnapshot calls getSnapshot there), so
    // the ref read is tracked even though the deps arrive through the
    // reactiveServices bucket rather than a plain service reference.
    const gates = {
      subscribe: () => () => {},
      getSnapshot: () => ({ isAdmin: isAdmin.value }),
    };
    const factory = (deps: any) =>
      deps.gates?.isAdmin ? { commands: [{ id: "admin" }] } : { commands: [] };

    const slots = resolveReactiveSlots({
      baseSlots: { commands: [{ id: "static" }] },
      factories: [factory],
      filter: undefined,
      stores: {},
      services: {},
      reactiveServices: { gates },
    }) as ComputedRef<{ commands: { id: string }[] }>;

    expect(slots.value.commands).toEqual([{ id: "static" }]);

    // Flip the reactive source the snapshot reads — the computed recomputes.
    isAdmin.value = true;
    expect(slots.value.commands).toEqual([{ id: "static" }, { id: "admin" }]);
  });
});

describe("useReactiveSlots", () => {
  it("throws outside a modular app", () => {
    expect(() => renderComposable(() => useReactiveSlots())).toThrow(/useReactiveSlots/);
  });

  it("returns the single shared reactive source the runtime provides", () => {
    const isAdmin = ref(false);
    const gates = {
      get isAdmin() {
        return isAdmin.value;
      },
    };
    const factory = (deps: any) =>
      deps.gates?.isAdmin ? { commands: [{ id: "admin" }] } : { commands: [] };
    // The runtime resolves the source once and provides it; the composable is a
    // thin reader over that one `computed`.
    const shared = resolveReactiveSlots({
      baseSlots: { commands: [{ id: "static" }] },
      factories: [factory],
      filter: undefined,
      stores: {},
      services: { gates },
      reactiveServices: {},
    });

    const a = renderComposable(() => useReactiveSlots<{ commands: { id: string }[] }>(), {
      provide: { [reactiveSlotsKey as symbol]: shared },
    });
    const b = renderComposable(() => useReactiveSlots<{ commands: { id: string }[] }>(), {
      provide: { [reactiveSlotsKey as symbol]: shared },
    });

    // Every consumer injects the *same* computed instance — no per-consumer rebuild.
    expect(a.result()).toBe(shared);
    expect(b.result()).toBe(shared);
    expect(a.result().value.commands).toEqual([{ id: "static" }]);

    // One reactive change updates the shared source both consumers read.
    isAdmin.value = true;
    expect(a.result().value.commands).toEqual([{ id: "static" }, { id: "admin" }]);
    expect(b.result().value.commands).toEqual([{ id: "static" }, { id: "admin" }]);
  });
});
