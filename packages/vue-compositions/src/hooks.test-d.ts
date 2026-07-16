import { describe, expectTypeOf, it } from "vitest";
import type { ShallowRef } from "vue";
import type { CompositionZoneEvent } from "@modular-frontend/compositions-engine";

import {
  createCompositionContext,
  useCompositionDispatch,
  useCompositionEmit,
  useCompositionState,
  useCompositionZone,
} from "./hooks.js";

interface EditorState {
  readonly documentId: string;
  readonly dirty: boolean;
}

// These assertions only need to type-check — they are never invoked (calling a
// composable outside setup would throw at runtime). The `.test-d.ts` include
// glob picks them up under `vitest --typecheck`.
describe("panel composable return types", () => {
  it("useCompositionState returns a ShallowRef of the full state or the selected slice", () => {
    const full = (): ShallowRef<EditorState> => useCompositionState<EditorState>();
    expectTypeOf(full).returns.toEqualTypeOf<ShallowRef<EditorState>>();

    const slice = (): ShallowRef<string> =>
      useCompositionState<EditorState, string>((s) => s.documentId);
    expectTypeOf(slice).returns.toEqualTypeOf<ShallowRef<string>>();
  });

  it("useCompositionDispatch is caller-asserted over TState", () => {
    const dispatch = useCompositionDispatch<EditorState>;
    expectTypeOf(dispatch).returns.toEqualTypeOf<
      (
        updater: Partial<EditorState> | ((prev: EditorState) => Partial<EditorState> | EditorState),
      ) => void
    >();
  });

  it("useCompositionEmit accepts a CompositionZoneEvent", () => {
    expectTypeOf(useCompositionEmit).returns.toEqualTypeOf<(event: CompositionZoneEvent) => void>();
  });

  it("useCompositionZone exposes the composition/instance/zone identity", () => {
    expectTypeOf(useCompositionZone).returns.toEqualTypeOf<{
      readonly compositionId: string;
      readonly instanceId: string;
      readonly zone: string;
    }>();
  });

  it("createCompositionContext yields a pre-typed bundle whose useState returns refs", () => {
    const { useState, useDispatch } = createCompositionContext<EditorState>();
    expectTypeOf(useState()).toEqualTypeOf<ShallowRef<EditorState>>();
    expectTypeOf(useState((s) => s.dirty)).toEqualTypeOf<ShallowRef<boolean>>();
    expectTypeOf(useDispatch()).toEqualTypeOf<
      (
        updater: Partial<EditorState> | ((prev: EditorState) => Partial<EditorState> | EditorState),
      ) => void
    >();
  });
});
