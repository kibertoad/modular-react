import { describe, expectTypeOf, test } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { defineJourney } from "./define-journey.js";
import { defineJourneyPersistence } from "./persistence.js";
import type { JourneyRegisterOptions } from "./types.js";

const exits = { ok: defineExit() } as const;
const mod = defineModule({
  id: "m",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    s: defineEntry({ component: (() => null) as never, input: schema<void>() }),
  },
});

type Modules = { readonly m: typeof mod };

interface Input {
  readonly tenantId: string;
}
interface State {
  readonly tenantId: string;
  readonly visits: number;
}

const journey = defineJourney<Modules, State>()({
  id: "j",
  version: "1.0.0",
  initialState: (input: Input) => ({ tenantId: input.tenantId, visits: 0 }),
  start: () => ({ module: "m", entry: "s", input: undefined }),
  transitions: { m: { s: { ok: () => ({ complete: null }) } } },
});

describe("JourneyRegisterOptions — persistence generic plumbing", () => {
  test("persistence slot accepts an adapter typed against TInput end-to-end", () => {
    const persistence = defineJourneyPersistence<Input, State>({
      keyFor: ({ input }) => `k:${input.tenantId}`,
      load: () => null,
      save: () => {},
      remove: () => {},
    });
    // A typed adapter assigns cleanly into JourneyRegisterOptions<State, Input>.
    const opts: JourneyRegisterOptions<State, Input> = { persistence };
    expectTypeOf(opts.persistence).not.toEqualTypeOf<undefined>();
  });

  test("mismatched TInput between journey and adapter is rejected", () => {
    interface OtherInput {
      readonly accountId: string;
    }
    const persistence = defineJourneyPersistence<OtherInput, State>({
      keyFor: ({ input }) => `k:${input.accountId}`,
      load: () => null,
      save: () => {},
      remove: () => {},
    });
    // @ts-expect-error — `persistence`'s TInput is OtherInput, not Input.
    const _opts: JourneyRegisterOptions<State, Input> = { persistence };
    // Silence "declared but never read" when @ts-expect-error suppresses.
    void _opts;
  });

  test("mismatched TState is rejected regardless of TInput", () => {
    interface OtherState {
      readonly totally: "different";
    }
    const persistence = defineJourneyPersistence<Input, OtherState>({
      keyFor: ({ input }) => `k:${input.tenantId}`,
      load: () => null,
      save: () => {},
      remove: () => {},
    });
    // @ts-expect-error — TState mismatch.
    const _opts: JourneyRegisterOptions<State, Input> = { persistence };
    void _opts;
  });

  test("journey fixture exists (smoke) — keeps this test file self-contained", () => {
    expectTypeOf(journey.id).toEqualTypeOf<string>();
  });
});
