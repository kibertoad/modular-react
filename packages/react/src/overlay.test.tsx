import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { defineOverlayHost, type OverlayEntry } from "@modular-react/core";
import { OverlayOutlet, useModalBehavior, useOverlay, useOverlaySubject } from "./overlay.js";
import { SlotsContext } from "./slots-context.js";

interface StepRef {
  readonly instanceId: string;
  readonly stepIndex: number;
}

const host = defineOverlayHost<StepRef>("resultViews");
const step: StepRef = { instanceId: "i1", stepIndex: 3 };

// A window that renders what it received, so tests can assert injection.
function Probe({ subject, extra = "" }: { subject?: StepRef | null; extra?: string }) {
  return (
    <div className="window">
      {String(subject?.stepIndex ?? "none")}:{extra}
    </div>
  );
}

const withSlots =
  (slots: object) =>
  ({ children }: { children: React.ReactNode }) => (
    <SlotsContext value={slots}>{children}</SlotsContext>
  );

const slotsOf = (...list: OverlayEntry<StepRef>[]) => ({ resultViews: list });

const twoWindows = slotsOf(
  { id: "test-report", component: Probe, title: (s) => (s ? `Report ${s.stepIndex}` : "Report") },
  { id: "merger-verdict", component: Probe },
);

const renderOutlet = (
  props: Partial<React.ComponentProps<typeof OverlayOutlet<StepRef>>> = {},
  slots: object = twoWindows,
) =>
  render(
    <SlotsContext value={slots}>
      <OverlayOutlet host={host} activeId={null} subject={step} {...props} />
    </SlotsContext>,
  );

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

const pressEscape = () => fireEvent.keyDown(document, { key: "Escape" });

describe("useOverlay", () => {
  it("resolves the one entry the active id names; null and dangling ids resolve to null", () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useOverlay(host, id),
      { wrapper: withSlots(twoWindows), initialProps: { id: null as string | null } },
    );
    expect(result.current).toBeNull();
    rerender({ id: "merger-verdict" });
    expect(result.current?.id).toBe("merger-verdict");
    rerender({ id: "dangling" });
    expect(result.current).toBeNull();
  });
});

describe("OverlayOutlet — selection", () => {
  it("renders exactly the one active window into document.body (portal, pick-one)", () => {
    const { baseElement } = renderOutlet({ activeId: "test-report" });
    expect(baseElement.querySelectorAll(".window")).toHaveLength(1);
    expect(document.body.querySelector("[data-overlay-id='test-report']")).not.toBeNull();
  });

  it("renders empty (and no shell) when nothing is active", () => {
    renderOutlet({ activeId: null, empty: <div className="empty">nothing open</div> });
    expect(document.querySelector(".empty")).not.toBeNull();
    expect(document.querySelector("[data-modular-overlay-backdrop]")).toBeNull();
  });

  it("renders nothing and dev-warns on a dangling active id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderOutlet({ activeId: "not-registered" });
    expect(document.querySelector(".window")).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('active id "not-registered"'));
    warn.mockRestore();
  });
});

describe("OverlayOutlet — shell and a11y", () => {
  it("wires role, aria-modal, aria-label (from title + subject), and the stable data hooks", () => {
    renderOutlet({ activeId: "test-report" });
    const panel = document.querySelector("[data-modular-overlay-panel]")!;
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(panel.getAttribute("aria-label")).toBe("Report 3");
    expect(panel.getAttribute("tabindex")).toBe("-1");
    expect(
      document.querySelector("[data-modular-overlay-backdrop]")!.getAttribute("data-overlay-id"),
    ).toBe("test-report");
  });

  it("passes entry props through with the injected subject winning", () => {
    const slots = slotsOf({
      id: "w",
      component: Probe,
      props: { extra: "carried", subject: { instanceId: "hijack", stepIndex: 99 } },
    });
    renderOutlet({ activeId: "w" }, slots);
    expect(document.querySelector(".window")!.textContent).toBe("3:carried");
  });

  it("applies classNames and renders the wrap chrome inside the dialog", () => {
    renderOutlet({
      activeId: "test-report",
      backdropClassName: "bd",
      panelClassName: "pn",
      wrap: ({ entry, children }) => (
        <section className="chrome" data-id={entry.id}>
          {children}
        </section>
      ),
    });
    expect(document.querySelector("[data-modular-overlay-backdrop]")!.className).toBe("bd");
    expect(document.querySelector("[data-modular-overlay-panel]")!.className).toBe("pn");
    expect(
      document.querySelector("[data-modular-overlay-panel] section.chrome .window"),
    ).not.toBeNull();
  });

  it("contains a throwing window in its error boundary, labeled Overlay", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom(): React.ReactNode {
      throw new Error("window exploded");
    }
    renderOutlet({ activeId: "boom" }, slotsOf({ id: "boom", component: Boom }));
    expect(document.body.textContent).toContain('Overlay "boom"');
    spy.mockRestore();
  });
});

describe("OverlayOutlet — close requests", () => {
  it("requests close on backdrop click-self only, honoring closeOnBackdrop", () => {
    const onClose = vi.fn();
    renderOutlet({ activeId: "test-report", onClose });
    fireEvent.click(document.querySelector("[data-modular-overlay-panel]")!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector("[data-modular-overlay-backdrop]")!);
    expect(onClose).toHaveBeenCalledTimes(1);

    cleanup();
    const onClose2 = vi.fn();
    renderOutlet({ activeId: "test-report", onClose: onClose2, closeOnBackdrop: false });
    fireEvent.click(document.querySelector("[data-modular-overlay-backdrop]")!);
    expect(onClose2).not.toHaveBeenCalled();
  });

  it("Escape closes only the top of the stack; the one below closes next", () => {
    const closeUnder = vi.fn();
    const closeOver = vi.fn();
    renderOutlet({ activeId: "test-report", onClose: closeUnder });
    const over = renderOutlet({ activeId: "merger-verdict", onClose: closeOver });

    pressEscape();
    expect(closeOver).toHaveBeenCalledTimes(1);
    expect(closeUnder).not.toHaveBeenCalled();

    // The app answers the close request by clearing the top's active id.
    over.rerender(
      <SlotsContext value={twoWindows}>
        <OverlayOutlet host={host} activeId={null} subject={step} onClose={closeOver} />
      </SlotsContext>,
    );
    pressEscape();
    expect(closeUnder).toHaveBeenCalledTimes(1);
    expect(closeOver).toHaveBeenCalledTimes(1);
  });
});

describe("OverlayOutlet — managed behaviour", () => {
  it("locks body scroll while open and restores it on close", () => {
    document.body.style.overflow = "scroll";
    const view = renderOutlet({ activeId: "test-report" });
    expect(document.body.style.overflow).toBe("hidden");
    view.rerender(
      <SlotsContext value={twoWindows}>
        <OverlayOutlet host={host} activeId={null} subject={step} />
      </SlotsContext>,
    );
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("moves focus into the dialog on open and returns it to the opener on close", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    function Focusable() {
      return <button className="inside">ok</button>;
    }
    const view = renderOutlet({ activeId: "w" }, slotsOf({ id: "w", component: Focusable }));
    expect((document.activeElement as HTMLElement | null)?.className).toBe("inside");

    view.rerender(
      <SlotsContext value={slotsOf({ id: "w", component: Focusable })}>
        <OverlayOutlet host={host} activeId={null} subject={step} />
      </SlotsContext>,
    );
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("remounts window content when subjectKey changes with the subject", () => {
    // Captures its first subject in state, so the test can tell a reused
    // instance from a remounted one.
    function Sticky({ subject }: { subject?: StepRef | null }) {
      const [initial] = useState(subject?.stepIndex);
      return <div className="window">{String(initial)}</div>;
    }
    const slots = slotsOf({ id: "sticky", component: Sticky });
    const next: StepRef = { instanceId: "i1", stepIndex: 9 };

    const reused = renderOutlet({ activeId: "sticky" }, slots);
    reused.rerender(
      <SlotsContext value={slots}>
        <OverlayOutlet host={host} activeId="sticky" subject={next} />
      </SlotsContext>,
    );
    expect(document.querySelector(".window")!.textContent).toBe("3");
    cleanup();

    const keyed = renderOutlet({ activeId: "sticky", subjectKey: (s) => s?.stepIndex ?? 0 }, slots);
    keyed.rerender(
      <SlotsContext value={slots}>
        <OverlayOutlet
          host={host}
          activeId="sticky"
          subject={next}
          subjectKey={(s) => s?.stepIndex ?? 0}
        />
      </SlotsContext>,
    );
    expect(document.querySelector(".window")!.textContent).toBe("9");
  });
});

describe("useOverlaySubject", () => {
  it("reads the outlet's subject without prop-drilling", () => {
    function Reader() {
      const subject = useOverlaySubject<StepRef>();
      return <div className="window">{String(subject?.stepIndex ?? "none")}</div>;
    }
    renderOutlet({ activeId: "r" }, slotsOf({ id: "r", component: Reader }));
    expect(document.querySelector(".window")!.textContent).toBe("3");
  });

  it("throws outside an OverlayOutlet", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useOverlaySubject())).toThrow(
      /useOverlaySubject must be used inside an <OverlayOutlet>/,
    );
    spy.mockRestore();
  });
});

describe("useModalBehavior (standalone)", () => {
  it("tracks top-of-stack across bespoke and hosted overlays, and closes top-first", () => {
    const closed = vi.fn();
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useModalBehavior({ active, onClose: closed }),
      { initialProps: { active: false } },
    );
    expect(result.current.isTop).toBe(false);

    rerender({ active: true });
    expect(result.current.isTop).toBe(true);

    // A hosted overlay opening above takes the top.
    const onClose = vi.fn();
    const over = renderOutlet({ activeId: "test-report", onClose });
    expect(result.current.isTop).toBe(false);
    pressEscape();
    expect(closed).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    over.unmount();
    expect(result.current.isTop).toBe(true);
    pressEscape();
    expect(closed).toHaveBeenCalledTimes(1);

    rerender({ active: false });
    expect(result.current.isTop).toBe(false);
  });
});
