import { describe, it, expectTypeOf } from "vitest";
import {
  defineOverlayHost,
  resolveOverlay,
  type OverlayEntry,
  type OverlayHostHandle,
} from "./overlay.js";
import type { ComponentEntry } from "./component-registry.js";
import type { UiComponent } from "./ui-types.js";

interface StepRef {
  readonly instanceId: string;
  readonly stepIndex: number;
}

describe("overlay types", () => {
  it("defineOverlayHost pins the subject type on the handle", () => {
    const host = defineOverlayHost<StepRef>("resultViews");
    expectTypeOf(host).toEqualTypeOf<OverlayHostHandle<StepRef>>();
    // The phantom subject carrier is typed but never present at runtime.
    expectTypeOf(host.__subject).toEqualTypeOf<StepRef | undefined>();
  });

  it("an entry's function title receives the host's subject, nullable", () => {
    const entry: OverlayEntry<StepRef> = {
      id: "test-report",
      component: () => null,
      title: (subject) => {
        // Selection is by id, so the subject may be absent while open.
        expectTypeOf(subject).toEqualTypeOf<StepRef | null>();
        return subject ? `Step ${subject.stepIndex}` : "Test report";
      },
    };
    expectTypeOf(entry.props).toEqualTypeOf<Record<string, unknown> | undefined>();
  });

  it("an OverlayEntry is assignable where a ComponentEntry is expected (superset)", () => {
    const entry: OverlayEntry<StepRef> = { id: "a", component: () => null };
    // The same slot can serve resolveComponentRegistry and the overlay host.
    expectTypeOf(entry).toMatchTypeOf<ComponentEntry<UiComponent>>();
  });

  it("resolveOverlay accepts a nullable id and returns an entry typed to the subject", () => {
    const entries: OverlayEntry<StepRef>[] = [];
    const activeId = null as string | null;
    expectTypeOf(resolveOverlay(entries, activeId)).toEqualTypeOf<OverlayEntry<StepRef> | null>();
  });
});
