import { describe, it, expect, vi, afterEach } from "vitest";
import { defineComponent, h, nextTick, ref, shallowRef } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineOverlayHost, type OverlayEntry } from "@modular-frontend/core";
import { OverlayOutlet, useModalBehavior, useOverlay, useOverlaySubject } from "./overlay.js";
import { slotsKey } from "./slots-context.js";
import { renderComposable } from "./test-render.js";

interface StepRef {
  readonly instanceId: string;
  readonly stepIndex: number;
}

const host = defineOverlayHost<StepRef>("resultViews");
const step: StepRef = { instanceId: "i1", stepIndex: 3 };

// A window component that records the subject it was rendered with.
const seen: unknown[] = [];
const Probe = defineComponent({
  props: { subject: { type: null as never, default: null }, extra: { type: String, default: "" } },
  setup(props) {
    seen.push(props.subject);
    return () => h("div", { class: "window" }, `window:${props.extra}`);
  },
});

const entries = (...list: OverlayEntry<StepRef>[]): { resultViews: OverlayEntry<StepRef>[] } => ({
  resultViews: list,
});

const twoWindows = entries(
  { id: "test-report", component: Probe, title: (s) => (s ? `Report ${s.stepIndex}` : "Report") },
  { id: "merger-verdict", component: Probe },
);

const mountOutlet = (
  props: Record<string, unknown> = {},
  slots?: object,
  outletSlots?: Record<string, unknown>,
) =>
  mount(OverlayOutlet, {
    props: { host, activeId: null, teleportDisabled: true, ...props },
    slots: outletSlots as never,
    global: { provide: { [slotsKey as symbol]: shallowRef(slots ?? twoWindows) } },
  });

// The behaviour registers on a module-level shared stack; make sure no overlay
// leaks into the next test.
const mounted: VueWrapper[] = [];
const track = <W extends VueWrapper>(w: W): W => {
  mounted.push(w);
  return w;
};
afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount();
  document.body.innerHTML = "";
});

const pressEscape = () =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

describe("useOverlay", () => {
  it("resolves the one entry the active id names, reactively", () => {
    const activeId = ref<string | null>(null);
    const { result, wrapper } = renderComposable(() => useOverlay(host, activeId), {
      provide: { [slotsKey as symbol]: shallowRef(twoWindows) },
    });
    track(wrapper);
    expect(result().value).toBeNull();
    activeId.value = "merger-verdict";
    expect(result().value?.id).toBe("merger-verdict");
    activeId.value = "dangling";
    expect(result().value).toBeNull();
  });

  it("throws outside a modular app", () => {
    expect(() => renderComposable(() => useOverlay(host, ref(null)))).toThrow(
      /useOverlay must be used within a modular app/,
    );
  });
});

describe("OverlayOutlet — selection", () => {
  it("renders exactly the one active window (pick-one, not render-all)", () => {
    const wrapper = track(mountOutlet({ activeId: "test-report", subject: step }));
    expect(wrapper.findAll(".window")).toHaveLength(1);
    expect(wrapper.find("[data-overlay-id='test-report']").exists()).toBe(true);
  });

  it("renders the #empty slot (and no shell) when nothing is active", () => {
    const wrapper = track(
      mountOutlet({ activeId: null }, undefined, {
        empty: () => h("div", { class: "empty" }, "nothing open"),
      }),
    );
    expect(wrapper.find(".empty").exists()).toBe(true);
    expect(wrapper.find("[data-modular-overlay-backdrop]").exists()).toBe(false);
  });

  it("renders nothing and dev-warns on a dangling active id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wrapper = track(mountOutlet({ activeId: "not-registered" }));
    expect(wrapper.find(".window").exists()).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('active id "not-registered"'));
    warn.mockRestore();
  });

  it("switches windows when the active id changes", async () => {
    const wrapper = track(mountOutlet({ activeId: "test-report" }));
    await wrapper.setProps({ activeId: "merger-verdict" });
    expect(wrapper.find("[data-overlay-id='merger-verdict']").exists()).toBe(true);
    await wrapper.setProps({ activeId: null });
    expect(wrapper.find("[data-modular-overlay-backdrop]").exists()).toBe(false);
  });

  it("teleports to body by default", () => {
    track(
      mount(OverlayOutlet, {
        props: { host, activeId: "test-report", subject: step },
        global: { provide: { [slotsKey as symbol]: shallowRef(twoWindows) } },
      }),
    );
    expect(document.body.querySelector("[data-modular-overlay-panel]")).not.toBeNull();
  });
});

describe("OverlayOutlet — shell and a11y", () => {
  it("wires role, aria-modal, aria-label (from title + subject), and the stable data hooks", () => {
    const wrapper = track(mountOutlet({ activeId: "test-report", subject: step }));
    const panel = wrapper.find("[data-modular-overlay-panel]");
    expect(panel.attributes("role")).toBe("dialog");
    expect(panel.attributes("aria-modal")).toBe("true");
    expect(panel.attributes("aria-label")).toBe("Report 3");
    expect(panel.attributes("tabindex")).toBe("-1");
    expect(wrapper.find("[data-modular-overlay-backdrop]").attributes("data-overlay-id")).toBe(
      "test-report",
    );
  });

  it("passes entry props through with the injected subject winning", () => {
    seen.length = 0;
    const slots = entries({
      id: "w",
      component: Probe,
      props: { extra: "carried", subject: "hijack" },
    });
    const wrapper = track(mountOutlet({ activeId: "w", subject: step }, slots));
    expect(wrapper.find(".window").text()).toBe("window:carried");
    expect(seen[0]).toEqual(step);
  });

  it("applies backdropClass / panelClass and renders the #wrap chrome inside the dialog", () => {
    const wrapper = track(
      mountOutlet(
        { activeId: "test-report", subject: step, backdropClass: "bd", panelClass: "pn" },
        undefined,
        {
          wrap: (args: { entry: OverlayEntry<StepRef>; children: unknown }) =>
            h("section", { class: "chrome", "data-id": args.entry.id }, [args.children as never]),
        },
      ),
    );
    expect(wrapper.find("[data-modular-overlay-backdrop]").classes()).toContain("bd");
    expect(wrapper.find("[data-modular-overlay-panel]").classes()).toContain("pn");
    const chrome = wrapper.find("[data-modular-overlay-panel] section.chrome");
    expect(chrome.exists()).toBe(true);
    expect(chrome.find(".window").exists()).toBe(true);
  });

  it("contains a throwing window in its error boundary, labeled Overlay", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = defineComponent({
      setup() {
        return () => {
          throw new Error("window exploded");
        };
      },
    });
    const wrapper = track(
      mountOutlet({ activeId: "boom" }, entries({ id: "boom", component: Boom })),
    );
    await nextTick();
    expect(wrapper.text()).toContain('Overlay "boom"');
    spy.mockRestore();
  });
});

describe("OverlayOutlet — close requests", () => {
  it("emits close on backdrop click, but not on a click inside the dialog", async () => {
    const wrapper = track(mountOutlet({ activeId: "test-report", subject: step }));
    await wrapper.find("[data-modular-overlay-panel]").trigger("click");
    expect(wrapper.emitted("close")).toBeUndefined();
    await wrapper.find("[data-modular-overlay-backdrop]").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("does not emit close on backdrop click when closeOnBackdrop is false", async () => {
    const wrapper = track(
      mountOutlet({ activeId: "test-report", subject: step, closeOnBackdrop: false }),
    );
    await wrapper.find("[data-modular-overlay-backdrop]").trigger("click");
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("does not emit close when a press starts inside the dialog and releases on the backdrop", async () => {
    const wrapper = track(mountOutlet({ activeId: "test-report", subject: step }));

    // Text selection / slipped drag: press starts on the panel, click lands on
    // the backdrop — not a close request.
    await wrapper.find("[data-modular-overlay-panel]").trigger("pointerdown");
    await wrapper.find("[data-modular-overlay-backdrop]").trigger("click");
    expect(wrapper.emitted("close")).toBeUndefined();

    // A deliberate backdrop press: starts and releases on the backdrop.
    await wrapper.find("[data-modular-overlay-backdrop]").trigger("pointerdown");
    await wrapper.find("[data-modular-overlay-backdrop]").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("emits close on Escape", async () => {
    const wrapper = track(mountOutlet({ activeId: "test-report", subject: step }));
    await nextTick();
    pressEscape();
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("Escape closes only the top of the stack; the one below closes next", async () => {
    const under = track(mountOutlet({ activeId: "test-report", subject: step }));
    await nextTick();
    const over = track(mountOutlet({ activeId: "merger-verdict" }));
    await nextTick();

    pressEscape();
    expect(over.emitted("close")).toHaveLength(1);
    expect(under.emitted("close")).toBeUndefined();

    // The app answers the close request by clearing the top's active id.
    await over.setProps({ activeId: null });
    await nextTick();
    pressEscape();
    expect(under.emitted("close")).toHaveLength(1);
    expect(over.emitted("close")).toHaveLength(1);
  });
});

describe("OverlayOutlet — managed behaviour", () => {
  it("locks body scroll while open and restores it on close", async () => {
    document.body.style.overflow = "scroll";
    const wrapper = track(mountOutlet({ activeId: "test-report", subject: step }));
    await nextTick();
    expect(document.body.style.overflow).toBe("hidden");
    await wrapper.setProps({ activeId: null });
    await nextTick();
    expect(document.body.style.overflow).toBe("scroll");
    document.body.style.overflow = "";
  });

  it("moves focus into the dialog on open and returns it to the opener on close", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const Focusable = defineComponent({
      props: { subject: { type: null as never, default: null } },
      setup() {
        return () => h("button", { class: "inside" }, "ok");
      },
    });
    // Teleport for real: focus() only moves document.activeElement for
    // elements attached to the document.
    const wrapper = track(
      mountOutlet(
        { activeId: "w", subject: step, teleportDisabled: false },
        entries({ id: "w", component: Focusable }),
      ),
    );
    await nextTick();
    await nextTick();
    expect((document.activeElement as HTMLElement | null)?.className).toBe("inside");

    await wrapper.setProps({ activeId: null });
    await nextTick();
    expect(document.activeElement).toBe(opener);
  });

  it("wraps Tab at the dialog's edges and pulls escaped focus back in", async () => {
    const TwoButtons = defineComponent({
      props: { subject: { type: null as never, default: null } },
      setup() {
        return () => [h("button", { class: "first" }, "a"), h("button", { class: "second" }, "b")];
      },
    });
    track(
      mountOutlet(
        { activeId: "w", subject: step, teleportDisabled: false },
        entries({ id: "w", component: TwoButtons }),
      ),
    );
    await nextTick();
    await nextTick();
    expect((document.activeElement as HTMLElement | null)?.className).toBe("first");

    const pressTab = (shiftKey = false) =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true }));

    // Tab from the last focusable wraps to the first.
    (document.querySelector(".second") as HTMLElement).focus();
    pressTab();
    expect((document.activeElement as HTMLElement | null)?.className).toBe("first");

    // Shift+Tab from the first wraps to the last.
    pressTab(true);
    expect((document.activeElement as HTMLElement | null)?.className).toBe("second");

    // Focus that escaped the dialog entirely is pulled back in on Tab.
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    pressTab();
    expect((document.activeElement as HTMLElement | null)?.className).toBe("first");
    outside.remove();
  });

  it("focuses the panel itself when the window has no focusable content, and keeps it there on Tab", async () => {
    track(mountOutlet({ activeId: "merger-verdict", teleportDisabled: false }));
    await nextTick();
    await nextTick();
    const panel = document.body.querySelector("[data-modular-overlay-panel]");
    expect(document.activeElement).toBe(panel);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(document.activeElement).toBe(panel);
  });

  it("moves focus into the new window when the active id switches without closing", async () => {
    const WinA = defineComponent({
      props: { subject: { type: null as never, default: null } },
      setup: () => () => h("button", { class: "in-a" }, "a"),
    });
    const WinB = defineComponent({
      props: { subject: { type: null as never, default: null } },
      setup: () => () => h("button", { class: "in-b" }, "b"),
    });
    const wrapper = track(
      mountOutlet(
        { activeId: "a", subject: step, teleportDisabled: false },
        entries({ id: "a", component: WinA }, { id: "b", component: WinB }),
      ),
    );
    await nextTick();
    await nextTick();
    expect((document.activeElement as HTMLElement | null)?.className).toBe("in-a");

    await wrapper.setProps({ activeId: "b" });
    await nextTick();
    await nextTick();
    expect((document.activeElement as HTMLElement | null)?.className).toBe("in-b");
  });

  it("keeps a window's instance state across subject changes without subjectKey, remounts with it", async () => {
    // Captures its first subject at setup, so the test can tell a reused
    // instance (stale capture survives) from a remounted one (fresh capture).
    const Sticky = defineComponent({
      props: { subject: { type: Object as never, required: true } },
      setup(props) {
        const initial = (props.subject as StepRef).stepIndex;
        return () => h("div", { class: "window" }, String(initial));
      },
    });
    const slots = entries({ id: "sticky", component: Sticky });

    const reused = track(mountOutlet({ activeId: "sticky", subject: step }, slots));
    await reused.setProps({ subject: { instanceId: "i1", stepIndex: 9 } });
    expect(reused.find(".window").text()).toBe("3");

    const remounted = track(
      mountOutlet(
        {
          activeId: "sticky",
          subject: step,
          subjectKey: (s: unknown) => (s as StepRef).stepIndex,
        },
        slots,
      ),
    );
    await remounted.setProps({ subject: { instanceId: "i1", stepIndex: 9 } });
    expect(remounted.find(".window").text()).toBe("9");
  });
});

describe("useOverlaySubject", () => {
  it("reads the outlet's subject reactively, without prop-drilling", async () => {
    const Reader = defineComponent({
      setup() {
        const subject = useOverlaySubject<StepRef>();
        return () => h("div", { class: "window" }, String(subject.value?.stepIndex ?? "none"));
      },
    });
    const wrapper = track(
      mountOutlet({ activeId: "r", subject: step }, entries({ id: "r", component: Reader })),
    );
    expect(wrapper.find(".window").text()).toBe("3");
    await wrapper.setProps({ subject: { instanceId: "i1", stepIndex: 7 } });
    expect(wrapper.find(".window").text()).toBe("7");
  });

  it("throws outside an OverlayOutlet", () => {
    expect(() => renderComposable(() => useOverlaySubject())).toThrow(
      /useOverlaySubject must be used inside an <OverlayOutlet>/,
    );
  });
});

describe("useModalBehavior (standalone)", () => {
  it("gives initial focus to initialFocus when provided", async () => {
    const Bespoke = defineComponent({
      props: { active: { type: Boolean, default: false } },
      setup(props) {
        const wanted = ref<HTMLElement | null>(null);
        const { dialogRef } = useModalBehavior({
          active: () => props.active,
          onClose: () => {},
          initialFocus: wanted,
        });
        return () =>
          h("div", { ref: dialogRef, tabindex: -1 }, [
            h("button", "first"),
            h("button", { ref: wanted, class: "wanted" }, "second"),
          ]);
      },
    });
    const wrapper = track(mount(Bespoke, { attachTo: document.body }));
    await wrapper.setProps({ active: true });
    await nextTick();
    await nextTick();
    expect((document.activeElement as HTMLElement | null)?.className).toBe("wanted");
  });

  it("tracks top-of-stack across bespoke and hosted overlays, and closes top-first", async () => {
    const active = ref(false);
    const closed = vi.fn();
    const { result, wrapper } = renderComposable(() =>
      useModalBehavior({ active, onClose: closed }),
    );
    track(wrapper);
    expect(result().isTop.value).toBe(false);

    active.value = true;
    await nextTick();
    expect(result().isTop.value).toBe(true);

    // A hosted overlay opening above takes the top.
    const over = track(mountOutlet({ activeId: "test-report", subject: step }));
    await nextTick();
    expect(result().isTop.value).toBe(false);
    pressEscape();
    expect(closed).not.toHaveBeenCalled();
    expect(over.emitted("close")).toHaveLength(1);

    over.unmount();
    mounted.splice(mounted.indexOf(over), 1);
    await nextTick();
    expect(result().isTop.value).toBe(true);
    pressEscape();
    expect(closed).toHaveBeenCalledTimes(1);

    active.value = false;
    await nextTick();
    expect(result().isTop.value).toBe(false);
  });
});
