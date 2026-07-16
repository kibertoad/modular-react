/**
 * Runtime guard tests for the journey-side mountKinds enforcement.
 *
 * Vue analog of `mount-kinds-runtime.test.tsx` in `@modular-react/journeys`.
 * The type-level filter on `StepSpec` is the primary defense, but the outlet
 * also checks `entry.mountKinds` at render time and surfaces a clear error if
 * it's been bypassed via `any`-cast or dynamic ids.
 */

import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import { createJourneyRuntime, defineJourney } from "@modular-frontend/journeys-engine";
import { JourneyOutlet } from "./outlet.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("journey outlet render-time mountKinds guard", () => {
  it("renders the error fallback when start() targets a composition-only entry", () => {
    const CompOnlyPanel = defineComponent({
      setup() {
        return () => h("div", { "data-testid": "comp-only" }, "should not render");
      },
    });
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
    type Mods = { readonly mod: typeof mod };
    const journey = defineJourney<Mods, {}>()({
      id: "bypass",
      version: "1.0.0",
      initialState: () => ({}),
      // Bypass the type filter on `start` — simulates a dynamic step id. The
      // render-time guard must still catch the mismatch.
      start: () => ({ module: "mod", entry: "compOnly", input: undefined }) as never,
      transitions: {},
    });
    const runtime = createJourneyRuntime([{ definition: journey, options: undefined } as never], {
      modules: { mod },
      debug: false,
    });
    const id = runtime.start("bypass", undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapper = mount(JourneyOutlet, { props: { runtime, instanceId: id } });

    expect(wrapper.find('[data-testid="comp-only"]').exists()).toBe(false);
    const text = wrapper.text();
    expect(text).toMatch(/mod\.compOnly/);
    expect(text).toMatch(/\["composition"\]/);
    expect(text).toMatch(/does not include "journey"/);
  });

  it("allows entries that include 'journey' in mountKinds", () => {
    const OkPanel = defineComponent({
      setup() {
        return () => h("div", { "data-testid": "ok" }, "ok");
      },
    });
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
    const wrapper = mount(JourneyOutlet, { props: { runtime, instanceId: id } });
    expect(wrapper.find('[data-testid="ok"]').exists()).toBe(true);
  });

  it("allows entries that omit mountKinds (defaults to every surface)", () => {
    const DefaultPanel = defineComponent({
      setup() {
        return () => h("div", { "data-testid": "default" }, "ok");
      },
    });
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
    const wrapper = mount(JourneyOutlet, { props: { runtime, instanceId: id } });
    expect(wrapper.find('[data-testid="default"]').exists()).toBe(true);
  });

  it("allows entries that declare both surfaces", () => {
    const BothPanel = defineComponent({
      setup() {
        return () => h("div", { "data-testid": "both" }, "ok");
      },
    });
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
    const wrapper = mount(JourneyOutlet, { props: { runtime, instanceId: id } });
    expect(wrapper.find('[data-testid="both"]').exists()).toBe(true);
  });
});
