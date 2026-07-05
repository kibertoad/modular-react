/**
 * Runtime guard tests for the journey-side mountKinds enforcement.
 *
 * Mirrors `mount-kinds-runtime.test.tsx` in `@modular-react/compositions`.
 * The type-level filter on `StepSpec` is the primary defense, but the
 * outlet also checks `entry.mountKinds` at render time and surfaces a
 * clear error if it's been bypassed via `any`-cast or dynamic ids.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";

import { defineJourney } from "@modular-frontend/journeys-engine";
import { createJourneyRuntime } from "@modular-frontend/journeys-engine";
import { JourneyOutlet } from "./outlet.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("journey outlet render-time mountKinds guard", () => {
  it("renders the error fallback when start() targets a composition-only entry", () => {
    function CompOnlyPanel(): React.ReactNode {
      return <div data-testid="comp-only">should not render</div>;
    }
    const mod = defineModule({
      id: "mod",
      version: "1.0.0",
      exitPoints: { done: defineExit() },
      entryPoints: {
        compOnly: defineEntry({
          component: CompOnlyPanel as never,
          input: schema<void>(),
          mountKinds: ["composition"],
        }),
      },
    });
    // Bypass the type filter on `start` — simulates an author who
    // assembled a dynamic step id at runtime. The render-time guard
    // must still catch the mismatch.
    type Mods = { readonly mod: typeof mod };
    const journey = defineJourney<Mods, {}>()({
      id: "bypass",
      version: "1.0.0",
      initialState: () => ({}),
      start: () =>
        ({
          module: "mod",
          entry: "compOnly",
          input: undefined,
        }) as never,
      transitions: {},
    });
    const runtime = createJourneyRuntime([{ definition: journey, options: undefined } as never], {
      modules: { mod },
      debug: false,
    });
    const id = runtime.start("bypass", undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(<JourneyOutlet runtime={runtime} instanceId={id} />);
    } finally {
      consoleError.mockRestore();
    }

    expect(screen.queryByTestId("comp-only")).toBeNull();
    // Error chrome rendered — message names the entry and the offending
    // mountKinds.
    const error = document.body.textContent ?? "";
    expect(error).toMatch(/mod\.compOnly/);
    expect(error).toMatch(/\["composition"\]/);
    expect(error).toMatch(/does not include "journey"/);
  });

  it("allows entries that include 'journey' in mountKinds", () => {
    function OkPanel(): React.ReactNode {
      return <div data-testid="ok">ok</div>;
    }
    const mod = defineModule({
      id: "mod",
      version: "1.0.0",
      entryPoints: {
        ok: defineEntry({
          component: OkPanel as never,
          input: schema<void>(),
          mountKinds: ["journey"],
        }),
      },
    });
    type Mods = { readonly mod: typeof mod };
    const journey = defineJourney<Mods, {}>()({
      id: "ok-host",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "mod", entry: "ok", input: undefined }),
      transitions: {},
    });
    const runtime = createJourneyRuntime([{ definition: journey, options: undefined } as never], {
      modules: { mod },
      debug: false,
    });
    const id = runtime.start("ok-host", undefined);
    render(<JourneyOutlet runtime={runtime} instanceId={id} />);
    expect(screen.getByTestId("ok")).toBeTruthy();
  });

  it("allows entries that omit mountKinds (defaults to every surface)", () => {
    function DefaultPanel(): React.ReactNode {
      return <div data-testid="default">ok</div>;
    }
    const mod = defineModule({
      id: "mod",
      version: "1.0.0",
      entryPoints: {
        plain: defineEntry({ component: DefaultPanel as never, input: schema<void>() }),
      },
    });
    type Mods = { readonly mod: typeof mod };
    const journey = defineJourney<Mods, {}>()({
      id: "default-host",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "mod", entry: "plain", input: undefined }),
      transitions: {},
    });
    const runtime = createJourneyRuntime([{ definition: journey, options: undefined } as never], {
      modules: { mod },
      debug: false,
    });
    const id = runtime.start("default-host", undefined);
    render(<JourneyOutlet runtime={runtime} instanceId={id} />);
    expect(screen.getByTestId("default")).toBeTruthy();
  });

  it("allows entries that declare both surfaces", () => {
    function BothPanel(): React.ReactNode {
      return <div data-testid="both">ok</div>;
    }
    const mod = defineModule({
      id: "mod",
      version: "1.0.0",
      entryPoints: {
        both: defineEntry({
          component: BothPanel as never,
          input: schema<void>(),
          mountKinds: ["journey", "composition"],
        }),
      },
    });
    type Mods = { readonly mod: typeof mod };
    const journey = defineJourney<Mods, {}>()({
      id: "both-host",
      version: "1.0.0",
      initialState: () => ({}),
      start: () => ({ module: "mod", entry: "both", input: undefined }),
      transitions: {},
    });
    const runtime = createJourneyRuntime([{ definition: journey, options: undefined } as never], {
      modules: { mod },
      debug: false,
    });
    const id = runtime.start("both-host", undefined);
    render(<JourneyOutlet runtime={runtime} instanceId={id} />);
    expect(screen.getByTestId("both")).toBeTruthy();
  });
});
