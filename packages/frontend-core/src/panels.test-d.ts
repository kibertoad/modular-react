import { describe, it, expectTypeOf } from "vitest";
import {
  definePanelGroup,
  resolvePanels,
  type PanelEntry,
  type PanelGroupHandle,
} from "./panels.js";

interface Block {
  readonly level: "frame" | "leaf";
  readonly type: string;
}

describe("panels types", () => {
  it("definePanelGroup pins the subject type on the handle", () => {
    const group = definePanelGroup<Block>("inspectorPanels");
    expectTypeOf(group).toEqualTypeOf<PanelGroupHandle<Block>>();
    // The phantom subject carrier is typed but never present at runtime.
    expectTypeOf(group.__subject).toEqualTypeOf<Block | undefined>();
  });

  it("a panel entry's `when` receives the group's subject", () => {
    const entry: PanelEntry<Block> = {
      id: "frontend-config",
      component: () => null,
      when: (subject) => {
        expectTypeOf(subject).toEqualTypeOf<Block>();
        return subject.type === "frontend";
      },
    };
    expectTypeOf(entry.order).toEqualTypeOf<number | undefined>();
  });

  it("resolvePanels accepts a nullable subject and returns entries typed to it", () => {
    const entries: PanelEntry<Block>[] = [];
    const nullableSubject = null as Block | null;
    expectTypeOf(resolvePanels(entries, nullableSubject)).toEqualTypeOf<
      readonly PanelEntry<Block>[]
    >();
  });
});
