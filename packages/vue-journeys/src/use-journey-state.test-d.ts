import { describe, it, expectTypeOf } from "vitest";
import type { ComputedRef, Ref, ShallowRef } from "vue";
import type { InstanceId, JourneyInstance } from "@modular-frontend/journeys-engine";

import {
  useActiveLeafJourneyInstance,
  useActiveLeafJourneyState,
  useJourneyInstance,
  useJourneyState,
} from "./use-journey-state.js";

interface Foo {
  readonly x: number;
}

// Type-only fixtures — this file is type-checked, never executed.
declare const id: InstanceId;
declare const idRef: Ref<InstanceId | null>;
declare const idGetter: () => InstanceId | null;

describe("journey composable typing", () => {
  it("state composables return a ComputedRef of the caller's state type or null", () => {
    expectTypeOf(useJourneyState<Foo>(id)).toEqualTypeOf<ComputedRef<Foo | null>>();
    expectTypeOf(useActiveLeafJourneyState<Foo>(id)).toEqualTypeOf<ComputedRef<Foo | null>>();
  });

  it("instance composables return a ShallowRef of the full JourneyInstance or null", () => {
    expectTypeOf(useJourneyInstance(id)).toEqualTypeOf<ShallowRef<JourneyInstance | null>>();
    expectTypeOf(useActiveLeafJourneyInstance(id)).toEqualTypeOf<
      ShallowRef<JourneyInstance | null>
    >();
  });

  it("ids accept a plain value, a ref, a getter, or null (MaybeRefOrGetter)", () => {
    expectTypeOf(useJourneyState<Foo>(idRef)).toEqualTypeOf<ComputedRef<Foo | null>>();
    expectTypeOf(useJourneyState<Foo>(idGetter)).toEqualTypeOf<ComputedRef<Foo | null>>();
    expectTypeOf(useJourneyState<Foo>(null)).toEqualTypeOf<ComputedRef<Foo | null>>();
  });
});
