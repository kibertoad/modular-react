import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { defineEntry, defineModule, schema } from "@modular-react/core";
import type { ModuleEntryProps } from "@modular-react/core";

import { defineComposition } from "./define-composition.js";
import { createCompositionRuntime } from "./runtime.js";
import { CompositionOutlet } from "./outlet.js";
import { CompositionsProvider } from "./provider.js";
import type { RegisteredComposition } from "./types.js";

afterEach(() => {
  cleanup();
});

/**
 * Tests for the prop-driven panel pattern: panels receive callbacks via
 * `input` instead of using `useCompositionState`/`useCompositionDispatch`.
 * The composition's selector closes over `ctx.dispatch` to wire panel
 * callbacks back into composition state. Verifies:
 *
 *   - `ctx.dispatch` is referentially stable across re-renders so
 *     `React.memo`'d panels can compare `input.onX` by identity.
 *   - Invoking the callback updates state; the next selector pass picks
 *     it up; the zone re-renders with the new value.
 */

interface CounterState {
  readonly count: number;
}

interface CounterInput {
  readonly count: number;
  readonly onIncrement: () => void;
}

function CounterPanel({ input }: ModuleEntryProps<CounterInput>) {
  return (
    <div data-testid="counter-panel">
      <span data-testid="count">{input.count}</span>
      <button data-testid="increment" onClick={input.onIncrement}>
        +
      </button>
    </div>
  );
}

const counterModule = defineModule({
  id: "counter",
  version: "1.0.0",
  entryPoints: {
    main: defineEntry({
      component: CounterPanel,
      input: schema<CounterInput>(),
    }),
  },
});

type CounterModules = { readonly counter: typeof counterModule };

describe("ZoneSelectorCtx.dispatch", () => {
  it("threads dispatch into panel input; panel-invoked callback updates state", async () => {
    const composition = defineComposition<CounterModules, CounterState>()({
      id: "counter-composition",
      version: "1.0.0",
      initialState: () => ({ count: 0 }),
      zones: {
        main: {
          select: ({ state, dispatch }) => ({
            kind: "module-entry",
            module: "counter",
            entry: "main",
            input: {
              count: state.count,
              onIncrement: () => dispatch((prev) => ({ count: prev.count + 1 })),
            },
          }),
        },
      },
    });

    const runtime = createCompositionRuntime(
      [{ definition: composition, options: undefined } satisfies RegisteredComposition],
      { modules: { counter: counterModule } },
    );
    const instanceId = runtime.start(composition.id, undefined);

    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId={composition.id} instanceId={instanceId}>
          {(zones) => <div>{zones.main}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );

    expect((await screen.findByTestId("count")).textContent).toBe("0");

    await act(async () => {
      screen.getByTestId("increment").click();
    });

    expect(screen.getByTestId("count").textContent).toBe("1");

    await act(async () => {
      screen.getByTestId("increment").click();
      screen.getByTestId("increment").click();
    });

    expect(screen.getByTestId("count").textContent).toBe("3");
  });

  it("dispatch reference is stable across selector calls in a single instance", () => {
    // Capture dispatch references seen by the selector across multiple
    // invocations triggered by state changes.
    const dispatchSightings: Array<(updater: unknown) => void> = [];

    const composition = defineComposition<CounterModules, CounterState>()({
      id: "stable-dispatch",
      version: "1.0.0",
      initialState: () => ({ count: 0 }),
      zones: {
        main: {
          select: ({ state, dispatch }) => {
            dispatchSightings.push(dispatch as (updater: unknown) => void);
            return {
              kind: "module-entry",
              module: "counter",
              entry: "main",
              input: { count: state.count, onIncrement: () => dispatch({ count: state.count + 1 }) },
            };
          },
        },
      },
    });

    const runtime = createCompositionRuntime(
      [{ definition: composition, options: undefined } satisfies RegisteredComposition],
      { modules: { counter: counterModule } },
    );
    const instanceId = runtime.start(composition.id, undefined);

    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId={composition.id} instanceId={instanceId}>
          {(zones) => <div>{zones.main}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );

    // Drive a few state changes — each one triggers a selector re-run.
    act(() => {
      runtime.dispatch(instanceId, { count: 1 });
    });
    act(() => {
      runtime.dispatch(instanceId, { count: 2 });
    });

    expect(dispatchSightings.length).toBeGreaterThanOrEqual(2);
    // Every render-path selector invocation receives the same dispatch
    // reference. (Preload-path invocations would see a no-op dispatch
    // and are not exercised in this test because no zone is `eager`.)
    const first = dispatchSightings[0];
    for (const seen of dispatchSightings) {
      expect(seen).toBe(first);
    }
  });
});
