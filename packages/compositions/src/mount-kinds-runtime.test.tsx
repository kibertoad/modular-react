/**
 * Runtime guard tests for the mountKinds Tier-3 encoding.
 *
 * Type-level filtering in `CompositionZoneSpec` is the primary
 * enforcement — see `mount-kinds.test-d.ts` for that. But authors
 * sometimes bypass the type system (any-typed module maps, `as never`,
 * dynamic entry ids) so the outlet also checks `entry.mountKinds` at
 * render time and surfaces a clear error instead of mounting a
 * mismatched panel that would silently drop exit calls.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";

import { defineComposition } from "./define-composition.js";
import { createCompositionRuntime } from "./runtime.js";
import { CompositionOutlet } from "./outlet.js";
import { CompositionsProvider } from "./provider.js";
import type { RegisteredComposition } from "./types.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("outlet render-time mountKinds guard", () => {
  it("renders the error fallback when a selector targets a journey-only entry", () => {
    // Author wired their module map with `as never` so the type-level
    // filter wasn't applied. The runtime guard catches the mismatch
    // and reports a clear, actionable error instead of mounting the
    // panel with a no-op exit.
    function JourneyOnlyPanel(): React.ReactNode {
      return <div data-testid="journey-only">should not render</div>;
    }
    const mod = defineModule({
      id: "mod",
      version: "1.0.0",
      exitPoints: { done: defineExit() },
      entryPoints: {
        journeyOnly: defineEntry({
          component: JourneyOnlyPanel as never,
          input: schema<void>(),
          mountKinds: ["journey"],
        }),
      },
    });
    // Cast through `never` deliberately — simulates an author bypassing
    // the type-level filter (e.g. a dynamic id derived from runtime
    // state). The render-time guard must still fire.
    const def = defineComposition<{}, {}>()({
      id: "bypass",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        body: {
          select: () =>
            ({
              kind: "module-entry",
              module: "mod",
              entry: "journeyOnly",
              input: undefined,
            }) as never,
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { mod }, debug: false },
    );
    const id = runtime.start("bypass", undefined);
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="bypass" instanceId={id}>
          {(zones) => <div>{zones.body}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );

    // The journey-only panel is NOT mounted.
    expect(screen.queryByTestId("journey-only")).toBeNull();

    // The error fallback IS rendered, with a message that names the
    // module, the entry, and the offending mountKinds.
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/mod\.journeyOnly/);
    expect(alert.textContent).toMatch(/\["journey"\]/);
    expect(alert.textContent).toMatch(/does not include "composition"/);
  });

  it("allows entries that include 'composition' in mountKinds", () => {
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
          mountKinds: ["composition"],
        }),
      },
    });
    const def = defineComposition<{ readonly mod: typeof mod }, {}>()({
      id: "allowed",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        body: {
          select: () => ({
            kind: "module-entry",
            module: "mod",
            entry: "ok",
            input: undefined,
          }),
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { mod }, debug: false },
    );
    const id = runtime.start("allowed", undefined);
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="allowed" instanceId={id}>
          {(zones) => <div>{zones.body}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    expect(screen.getByTestId("ok")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
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
    const def = defineComposition<{ readonly mod: typeof mod }, {}>()({
      id: "default-host",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        body: {
          select: () => ({
            kind: "module-entry",
            module: "mod",
            entry: "plain",
            input: undefined,
          }),
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { mod }, debug: false },
    );
    const id = runtime.start("default-host", undefined);
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="default-host" instanceId={id}>
          {(zones) => <div>{zones.body}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    expect(screen.getByTestId("default")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("allows entries that include both 'journey' and 'composition'", () => {
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
    const def = defineComposition<{ readonly mod: typeof mod }, {}>()({
      id: "both-host",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        body: {
          select: () => ({
            kind: "module-entry",
            module: "mod",
            entry: "both",
            input: undefined,
          }),
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { mod }, debug: false },
    );
    const id = runtime.start("both-host", undefined);
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="both-host" instanceId={id}>
          {(zones) => <div>{zones.body}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    expect(screen.getByTestId("both")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
