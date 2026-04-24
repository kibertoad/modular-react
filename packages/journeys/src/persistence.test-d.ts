import { describe, expectTypeOf, test } from "vitest";
import { defineJourneyPersistence } from "./persistence.js";
import type { JourneyPersistence, SerializedJourney } from "./types.js";

interface CustomerInput {
  readonly customerId: string;
}
interface CustomerState {
  readonly customerId: string;
  readonly step: number;
}

// Build a fixture adapter — used in the assertions below so each test
// describes "what should this typed reference let me do?" rather than
// re-declaring the adapter.
const adapter = defineJourneyPersistence<CustomerInput, CustomerState>({
  keyFor: ({ input }) => `k:${input.customerId}`,
  load: () => null,
  save: () => {},
  remove: () => {},
});

describe("defineJourneyPersistence", () => {
  test("return type preserves both TInput and TState", () => {
    expectTypeOf(adapter).toEqualTypeOf<JourneyPersistence<CustomerState, CustomerInput>>();
  });

  test("keyFor narrows `input` to the journey's TInput (not unknown)", () => {
    // The whole point of the helper — outside-the-runtime callers
    // (e.g. a `hasPersistedJourney` probe) see the typed shape.
    expectTypeOf(adapter.keyFor).parameter(0).toEqualTypeOf<{
      journeyId: string;
      input: CustomerInput;
    }>();
  });

  test("load / save are typed against SerializedJourney<TState>", () => {
    expectTypeOf(adapter.load).returns.toEqualTypeOf<
      SerializedJourney<CustomerState> | null | Promise<SerializedJourney<CustomerState> | null>
    >();
    expectTypeOf(adapter.save).parameter(1).toEqualTypeOf<SerializedJourney<CustomerState>>();
  });

  test("calling keyFor with a wrongly-typed input is a compile error", () => {
    // @ts-expect-error — `id` is not a property of CustomerInput.
    adapter.keyFor({ journeyId: "x", input: { id: "nope" } });

    // @ts-expect-error — customerId must be string, not number.
    adapter.keyFor({ journeyId: "x", input: { customerId: 1 } });

    // The correct shape compiles.
    adapter.keyFor({ journeyId: "x", input: { customerId: "ok" } });
  });

  test("JourneyPersistence<TState> (one generic) still works — TInput defaults to unknown", () => {
    // Back-compat: adapters that don't care about TInput still typecheck.
    const loose: JourneyPersistence<CustomerState> = {
      keyFor: ({ input }) => `k:${String(input)}`,
      load: () => null,
      save: () => {},
      remove: () => {},
    };
    expectTypeOf(loose.keyFor).parameter(0).toEqualTypeOf<{
      journeyId: string;
      input: unknown;
    }>();
  });
});
