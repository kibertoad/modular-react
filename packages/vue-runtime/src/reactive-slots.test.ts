import { describe, it, expect } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import {
  createMemoryHistory,
  createRouter,
  RouterView,
  type RouteRecordRaw,
} from "vue-router";
import { useReactiveSlots } from "@modular-vue/vue";
import { createRegistry } from "./registry.js";
import { createModularApp } from "./app.js";

interface Slots {
  nav: { id: string; gate?: string }[];
  [key: string]: readonly unknown[];
}

// End-to-end proof that the reactive-slots config the runtime provides at
// install time (providers.ts) reaches `useReactiveSlots`, and that a host
// slotFilter reading a reactive service recomputes on a reactive change with no
// recalculateSlots() call — the RBAC-gating shape a shell relies on.
describe("useReactiveSlots via resolve()", () => {
  it("recomputes on a reactive change installed through the manifest", async () => {
    const canWrite = ref(true);
    // A plain service whose getter reads a reactive ref (the reactive-source
    // pattern the reactive path supports; a snapshot store would not track).
    const gates = {
      get canWrite() {
        return canWrite.value;
      },
    };

    const registry = createRegistry<{ gates: typeof gates }, Slots>({
      services: { gates },
      slots: { nav: [{ id: "always" }, { id: "guarded", gate: "canWrite" }] },
    });

    const home: RouteRecordRaw = {
      path: "/",
      name: "home",
      component: defineComponent({
        name: "HomePage",
        setup() {
          const slots = useReactiveSlots<Slots>();
          return () => h("p", { class: "nav" }, slots.value.nav.map((i) => i.id).join(","));
        },
      }),
    };
    const router = createRouter({ history: createMemoryHistory(), routes: [home] });
    const app = createModularApp(registry, {
      router,
      slotFilter: (slots, deps) => ({
        nav: slots.nav.filter((i) => i.gate == null || (deps.gates as Record<string, boolean>)?.[i.gate]),
      }),
    });

    const wrapper = mount(
      defineComponent({ setup: () => () => h(RouterView) }),
      { global: { plugins: [router, app] } },
    );
    await router.isReady();
    await flushPromises();

    expect(wrapper.find(".nav").text()).toBe("always,guarded");

    // Revoke write access — the guarded item drops with no signal fired.
    canWrite.value = false;
    await nextTick();
    expect(wrapper.find(".nav").text()).toBe("always");
  });
});
