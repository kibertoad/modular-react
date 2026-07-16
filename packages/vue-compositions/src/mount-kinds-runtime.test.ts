/**
 * Runtime guard tests for the mountKinds compile-time encoding.
 *
 * Type-level filtering in `CompositionZoneSpec` is the primary enforcement — see
 * `@modular-frontend/compositions-engine`'s `mount-kinds.test-d.ts` for that.
 * But authors sometimes bypass the type system (any-typed module maps,
 * `as never`, dynamic entry ids) so the outlet also checks `entry.mountKinds` at
 * render time and surfaces a clear error instead of mounting a mismatched panel
 * that would silently drop exit calls. Ported from the React
 * `mount-kinds-runtime.test.tsx`.
 */

import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";

import { createCompositionRuntime, defineComposition } from "@modular-frontend/compositions-engine";
import type { RegisteredComposition } from "@modular-frontend/compositions-engine";
import { CompositionOutlet } from "./outlet.js";
import { CompositionsProvider } from "./provider.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function mountViaProvider(
  runtime: ReturnType<typeof createCompositionRuntime>,
  outletProps: Record<string, unknown>,
  slotFn: (zones: Record<string, unknown>) => unknown,
) {
  return mount(CompositionsProvider, {
    props: { runtime },
    slots: { default: () => h(CompositionOutlet, outletProps, { default: slotFn }) },
  });
}

const OkPanel = defineComponent({
  name: "OkPanel",
  props: {
    input: { type: null, default: undefined },
    exit: { type: Function, default: undefined },
  },
  setup() {
    return () => h("div", { "data-testid": "ok" }, "ok");
  },
});

describe("outlet render-time mountKinds guard", () => {
  it("renders the error fallback when a selector targets a journey-only entry", () => {
    const JourneyOnlyPanel = defineComponent({
      name: "JourneyOnlyPanel",
      props: {
        input: { type: null, default: undefined },
        exit: { type: Function, default: undefined },
      },
      setup() {
        return () => h("div", { "data-testid": "journey-only" }, "should not render");
      },
    });
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
    // Cast through `never` deliberately — simulates an author bypassing the
    // type-level filter. The render-time guard must still fire.
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
    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "bypass", instanceId: id },
      (zones) => h("div", [zones.body]),
    );

    expect(wrapper.find('[data-testid="journey-only"]').exists()).toBe(false);

    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toMatch(/mod\.journeyOnly/);
    expect(alert.text()).toMatch(/\["journey"\]/);
    expect(alert.text()).toMatch(/does not include "composition"/);
  });

  it("allows entries that include 'composition' in mountKinds", () => {
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
          select: () => ({ kind: "module-entry", module: "mod", entry: "ok", input: undefined }),
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { mod }, debug: false },
    );
    const id = runtime.start("allowed", undefined);
    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "allowed", instanceId: id },
      (zones) => h("div", [zones.body]),
    );
    expect(wrapper.find('[data-testid="ok"]').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("allows entries that omit mountKinds (defaults to every surface)", () => {
    const mod = defineModule({
      id: "mod",
      version: "1.0.0",
      entryPoints: { plain: defineEntry({ component: OkPanel as never, input: schema<void>() }) },
    });
    const def = defineComposition<{ readonly mod: typeof mod }, {}>()({
      id: "default-host",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        body: {
          select: () => ({ kind: "module-entry", module: "mod", entry: "plain", input: undefined }),
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { mod }, debug: false },
    );
    const id = runtime.start("default-host", undefined);
    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "default-host", instanceId: id },
      (zones) => h("div", [zones.body]),
    );
    expect(wrapper.find('[data-testid="ok"]').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("allows entries that include both 'journey' and 'composition'", () => {
    const mod = defineModule({
      id: "mod",
      version: "1.0.0",
      entryPoints: {
        both: defineEntry({
          component: OkPanel as never,
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
          select: () => ({ kind: "module-entry", module: "mod", entry: "both", input: undefined }),
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { mod }, debug: false },
    );
    const id = runtime.start("both-host", undefined);
    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "both-host", instanceId: id },
      (zones) => h("div", [zones.body]),
    );
    expect(wrapper.find('[data-testid="ok"]').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
