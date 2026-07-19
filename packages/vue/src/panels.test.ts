import { describe, it, expect, vi } from "vitest";
import { defineComponent, h, ref, shallowRef, computed, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { definePanelGroup, type PanelEntry } from "@modular-frontend/core";
import { PanelsOutlet, usePanels, usePanelSubject } from "./panels.js";
import { reactiveSlotsKey, slotsKey } from "./slots-context.js";
import { renderComposable } from "./test-render.js";

interface Block {
  readonly level: "frame" | "leaf";
  readonly type: string;
}

const group = definePanelGroup<Block>("inspectorPanels");

// A panel component that records the subject it was rendered with.
const seen: Block[] = [];
const Probe = defineComponent({
  props: { subject: { type: Object, required: true } },
  setup(props) {
    seen.push(props.subject as Block);
    return () => h("div", { class: "panel" }, (props.subject as Block).type);
  },
});

const entries = (...list: PanelEntry<Block>[]): { inspectorPanels: PanelEntry<Block>[] } => ({
  inspectorPanels: list,
});

describe("usePanels", () => {
  it("resolves the group's slot entries against the subject", () => {
    const slots = entries(
      { id: "frontend", component: Probe, when: (b) => b.type === "frontend" },
      { id: "leaf", component: Probe, when: (b) => b.level === "leaf" },
    );
    const { result } = renderComposable(
      () => usePanels(group, ref<Block | null>({ level: "frame", type: "frontend" })),
      { provide: { [slotsKey as symbol]: shallowRef(slots) } },
    );
    expect(result().value.map((p) => p.id)).toEqual(["frontend"]);
  });

  it("re-resolves when the subject ref changes", () => {
    const slots = entries(
      { id: "frontend", component: Probe, when: (b) => b.type === "frontend" },
      { id: "leaf", component: Probe, when: (b) => b.level === "leaf" },
    );
    const subject = ref<Block | null>({ level: "frame", type: "frontend" });
    const { result } = renderComposable(() => usePanels(group, subject), {
      provide: { [slotsKey as symbol]: shallowRef(slots) },
    });
    expect(result().value.map((p) => p.id)).toEqual(["frontend"]);
    subject.value = { level: "leaf", type: "widget" };
    expect(result().value.map((p) => p.id)).toEqual(["leaf"]);
  });

  it("prefers the reactive slots source when both are provided", () => {
    const reactive = entries({ id: "from-reactive", component: Probe });
    const signal = entries({ id: "from-signal", component: Probe });
    const { result } = renderComposable(
      () => usePanels(group, ref<Block | null>({ level: "frame", type: "x" })),
      {
        provide: {
          [reactiveSlotsKey as symbol]: computed(() => reactive),
          [slotsKey as symbol]: shallowRef(signal),
        },
      },
    );
    expect(result().value.map((p) => p.id)).toEqual(["from-reactive"]);
  });

  it("throws outside a modular app", () => {
    expect(() => renderComposable(() => usePanels(group, ref<Block | null>(null)))).toThrow(
      /usePanels must be used within a modular app/,
    );
  });
});

describe("PanelsOutlet", () => {
  const twoPanels = entries(
    { id: "frontend", component: Probe, order: 20, when: (b) => b.type === "frontend" },
    { id: "always", component: Probe, order: 10 },
  );

  const mountOutlet = (subject: Block | null, slots?: object) =>
    mount(PanelsOutlet, {
      props: { group, subject },
      global: { provide: { [slotsKey as symbol]: shallowRef(slots ?? twoPanels) } },
    });

  it("renders every matching panel, ordered, with the subject as a prop", () => {
    seen.length = 0;
    const subject: Block = { level: "frame", type: "frontend" };
    const wrapper = mountOutlet(subject);
    // order 10 (always) before order 20 (frontend)
    expect(wrapper.findAll(".panel").map((n) => n.text())).toEqual(["frontend", "frontend"]);
    // Vue hands each panel the subject (compared by value — props arrive as a
    // reactive view of the raw object, not the same reference).
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual(subject);
  });

  it("renders the #empty slot when nothing matches", () => {
    const onlyLeaf = entries({ id: "leaf", component: Probe, when: (b) => b.level === "leaf" });
    const wrapper = mount(PanelsOutlet, {
      props: { group, subject: { level: "frame", type: "frontend" } as Block },
      slots: { empty: () => h("div", { class: "empty" }, "no panels") },
      global: { provide: { [slotsKey as symbol]: shallowRef(onlyLeaf) } },
    });
    expect(wrapper.find(".empty").exists()).toBe(true);
    expect(wrapper.find(".panel").exists()).toBe(false);
  });

  it("renders the #empty slot for a null subject without running predicates", () => {
    const wrapper = mount(PanelsOutlet, {
      props: { group, subject: null },
      slots: { empty: () => h("div", { class: "empty" }, "nothing selected") },
      global: { provide: { [slotsKey as symbol]: shallowRef(twoPanels) } },
    });
    expect(wrapper.find(".empty").exists()).toBe(true);
  });

  it("wraps each panel with the #wrap slot chrome", () => {
    const wrapper = mount(PanelsOutlet, {
      props: { group, subject: { level: "frame", type: "frontend" } as Block },
      slots: {
        wrap: ({ entry, children }: { entry: PanelEntry<Block>; children: unknown }) =>
          h("section", { class: "chrome", "data-id": entry.id }, [children as never]),
      },
      global: { provide: { [slotsKey as symbol]: shallowRef(twoPanels) } },
    });
    expect(wrapper.findAll("section.chrome")).toHaveLength(2);
  });

  it("contains a throwing panel in its error boundary", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = defineComponent({
      setup() {
        return () => {
          throw new Error("panel exploded");
        };
      },
    });
    const slots = entries(
      { id: "boom", component: Boom, order: 1 },
      { id: "ok", component: Probe, order: 2 },
    );
    const wrapper = mount(PanelsOutlet, {
      props: { group, subject: { level: "frame", type: "frontend" } as Block },
      global: { provide: { [slotsKey as symbol]: shallowRef(slots) } },
    });
    // The boundary swaps to its notice on the re-render its `error` ref queues.
    await nextTick();
    // The healthy panel still renders; the boom panel is swapped for the notice.
    expect(wrapper.find(".panel").exists()).toBe(true);
    expect(wrapper.text()).toContain("boom");
    spy.mockRestore();
  });

  it("exposes the subject to descendants via usePanelSubject", () => {
    let injected: Block | undefined;
    const Reader = defineComponent({
      setup() {
        const subject = usePanelSubject<Block>();
        injected = subject.value;
        return () => h("div");
      },
    });
    mount(PanelsOutlet, {
      props: { group, subject: { level: "leaf", type: "widget" } as Block },
      global: {
        provide: {
          [slotsKey as symbol]: shallowRef(entries({ id: "reader", component: Reader })),
        },
      },
    });
    expect(injected).toEqual({ level: "leaf", type: "widget" });
  });
});

describe("usePanelSubject", () => {
  it("throws outside a PanelsOutlet", () => {
    expect(() => renderComposable(() => usePanelSubject())).toThrow(/usePanelSubject/);
  });
});
