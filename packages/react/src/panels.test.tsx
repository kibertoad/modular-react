import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, renderHook } from "@testing-library/react";
import { definePanelGroup, type PanelEntry } from "@modular-react/core";
import { PanelsOutlet, usePanels, usePanelSubject } from "./panels.js";
import { SlotsContext } from "./slots-context.js";

interface Block {
  readonly level: "frame" | "leaf";
  readonly type: string;
}

const group = definePanelGroup<Block>("inspectorPanels");

// A panel that renders the subject it received, so tests can assert injection.
function Probe({ subject }: { subject: Block }) {
  return <div className="panel">{subject.type}</div>;
}

// Captures its first subject in state, so tests can tell a reused instance
// (stale capture survives) from a remounted one (fresh capture).
function Sticky({ subject }: { subject: Block }) {
  const [initial] = useState(subject.type);
  return <div className="panel">{initial}</div>;
}

const withSlots =
  (slots: object) =>
  ({ children }: { children: React.ReactNode }) => (
    <SlotsContext value={slots}>{children}</SlotsContext>
  );

const slotsOf = (...list: PanelEntry<Block>[]) => ({ inspectorPanels: list });

describe("usePanels", () => {
  it("resolves and filters the group's entries against the subject", () => {
    const slots = slotsOf(
      { id: "frontend", component: Probe, when: (b) => b.type === "frontend" },
      { id: "leaf", component: Probe, when: (b) => b.level === "leaf" },
    );
    const { result } = renderHook(
      () => usePanels(group, { level: "frame", type: "frontend" } as Block),
      { wrapper: withSlots(slots) },
    );
    expect(result.current.map((p) => p.id)).toEqual(["frontend"]);
  });

  it("returns no panels for a null subject", () => {
    const slots = slotsOf({ id: "frontend", component: Probe });
    const { result } = renderHook(() => usePanels(group, null), { wrapper: withSlots(slots) });
    expect(result.current).toEqual([]);
  });
});

describe("PanelsOutlet", () => {
  const twoPanels = slotsOf(
    { id: "frontend", component: Probe, order: 20, when: (b) => b.type === "frontend" },
    { id: "always", component: Probe, order: 10 },
  );

  it("renders every matching panel, ordered, with the subject as a prop", () => {
    const { container } = render(
      <PanelsOutlet group={group} subject={{ level: "frame", type: "frontend" }} />,
      { wrapper: withSlots(twoPanels) },
    );
    // order 10 (always) before order 20 (frontend); both get subject.type.
    expect([...container.querySelectorAll(".panel")].map((n) => n.textContent)).toEqual([
      "frontend",
      "frontend",
    ]);
  });

  it("renders the empty node when nothing matches", () => {
    const onlyLeaf = slotsOf({ id: "leaf", component: Probe, when: (b) => b.level === "leaf" });
    const { container } = render(
      <PanelsOutlet
        group={group}
        subject={{ level: "frame", type: "frontend" }}
        empty={<div className="empty">no panels</div>}
      />,
      { wrapper: withSlots(onlyLeaf) },
    );
    expect(container.querySelector(".empty")).not.toBeNull();
    expect(container.querySelector(".panel")).toBeNull();
  });

  it("renders the empty node for a null subject", () => {
    const { container } = render(
      <PanelsOutlet group={group} subject={null} empty={<div className="empty">nothing</div>} />,
      { wrapper: withSlots(twoPanels) },
    );
    expect(container.querySelector(".empty")).not.toBeNull();
  });

  it("wraps each panel with the wrap render-prop chrome", () => {
    const { container } = render(
      <PanelsOutlet
        group={group}
        subject={{ level: "frame", type: "frontend" }}
        wrap={({ entry, children }) => (
          <section className="chrome" data-id={entry.id}>
            {children}
          </section>
        )}
      />,
      { wrapper: withSlots(twoPanels) },
    );
    expect(container.querySelectorAll("section.chrome")).toHaveLength(2);
  });

  it("contains a throwing panel in its error boundary", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom(): React.ReactNode {
      throw new Error("panel exploded");
    }
    const slots = slotsOf(
      { id: "boom", component: Boom, order: 1 },
      { id: "ok", component: Probe, order: 2 },
    );
    const { container } = render(
      <PanelsOutlet group={group} subject={{ level: "frame", type: "frontend" }} />,
      { wrapper: withSlots(slots) },
    );
    // The healthy panel still renders; the boom panel shows the boundary
    // notice, labeled as a panel (not mislabeled a module).
    expect(container.querySelector(".panel")).not.toBeNull();
    expect(container.textContent).toContain('Panel "boom"');
    spy.mockRestore();
  });

  it("forwards onDuplicate to the resolver", () => {
    const dup = slotsOf(
      { id: "dup", component: Probe, order: 1 },
      { id: "dup", component: Probe, order: 2 },
    );
    const { container } = render(
      <PanelsOutlet
        group={group}
        subject={{ level: "frame", type: "frontend" }}
        onDuplicate="first-wins"
      />,
      { wrapper: withSlots(dup) },
    );
    expect(container.querySelectorAll(".panel")).toHaveLength(1);
  });

  it("keeps a panel's instance state across subject changes without subjectKey", () => {
    const slots = slotsOf({ id: "sticky", component: Sticky });
    const { container, rerender } = render(
      <PanelsOutlet group={group} subject={{ level: "frame", type: "one" }} />,
      { wrapper: withSlots(slots) },
    );
    rerender(<PanelsOutlet group={group} subject={{ level: "frame", type: "two" }} />);
    // Keyed on entry.id alone → same instance, first capture survives.
    expect(container.querySelector(".panel")?.textContent).toBe("one");
  });

  it("remounts panel content when subjectKey changes with the subject", () => {
    const slots = slotsOf({ id: "sticky", component: Sticky });
    const subjectKey = (b: Block) => b.type;
    const { container, rerender } = render(
      <PanelsOutlet
        group={group}
        subject={{ level: "frame", type: "one" }}
        subjectKey={subjectKey}
      />,
      { wrapper: withSlots(slots) },
    );
    rerender(
      <PanelsOutlet
        group={group}
        subject={{ level: "frame", type: "two" }}
        subjectKey={subjectKey}
      />,
    );
    // The subject's identity is folded into the key → fresh mount, new capture.
    expect(container.querySelector(".panel")?.textContent).toBe("two");
  });

  it("exposes the subject to descendants via usePanelSubject", () => {
    let injected: Block | undefined;
    function Reader() {
      injected = usePanelSubject<Block>();
      return <div />;
    }
    render(<PanelsOutlet group={group} subject={{ level: "leaf", type: "widget" }} />, {
      wrapper: withSlots(slotsOf({ id: "reader", component: Reader })),
    });
    expect(injected).toEqual({ level: "leaf", type: "widget" });
  });
});

describe("usePanelSubject", () => {
  it("throws outside a PanelsOutlet", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => usePanelSubject())).toThrow(/usePanelSubject/);
    spy.mockRestore();
  });
});
