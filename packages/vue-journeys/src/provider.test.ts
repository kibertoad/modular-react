import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import { useModuleExit } from "@modular-vue/vue";

import { createJourneyRuntime, defineJourney } from "@modular-frontend/journeys-engine";
import { JourneyProvider, useJourneyContext } from "./provider.js";
import type { JourneyProviderValue } from "./provider.js";

const exits = { confirmed: defineExit<{ id: string }>() } as const;

const mod = defineModule({
  id: "review",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    review: defineEntry({
      component: (() => null) as never,
      input: schema<{ customerId: string }>(),
    }),
  },
});

type Modules = { readonly review: typeof mod };

const journey = defineJourney<Modules, { customerId: string }>()({
  id: "j",
  version: "1.0.0",
  initialState: (input: { customerId: string }) => ({ customerId: input.customerId }),
  start: (s) => ({ module: "review", entry: "review", input: { customerId: s.customerId } }),
  transitions: {
    review: {
      review: {
        confirmed: () => ({ complete: { ok: true } }),
      },
    },
  },
});

describe("JourneyProvider", () => {
  it("exposes the runtime to descendants through context without threading props", () => {
    const runtime = createJourneyRuntime([{ definition: journey, options: undefined }], {
      modules: { review: mod },
      debug: false,
    });

    let seen: JourneyProviderValue | null = null;
    const Probe = defineComponent({
      setup() {
        seen = useJourneyContext();
        return () => null;
      },
    });

    // Render the provider through `h()` (as a real app / the plugin does) rather
    // than as the mounted root — vue-test-utils holds a root's props in a deep
    // `reactive()`, which would proxy the runtime and defeat the identity check.
    const Root = defineComponent({
      setup() {
        return () => h(JourneyProvider, { runtime }, () => h(Probe));
      },
    });
    mount(Root);

    // The descendant pulled `runtime` from context — no prop threading, and the
    // exact reference is preserved (no copy).
    expect(seen).not.toBeNull();
    expect(seen!.runtime).toBe(runtime);
  });

  it("forwards module exits to the provider-level onModuleExit after the per-host onExit runs", () => {
    const runtime = createJourneyRuntime([], { modules: { review: mod }, debug: false });
    const globalOnExit = vi.fn();
    const localOnExit = vi.fn();

    // Stand-in for a module host: `useModuleExit` is the "step 0" primitive
    // that `<ModuleRoute>` / tabs build on. It runs the local handler, then
    // forwards to the nearest ModuleExitProvider — which JourneyProvider mounts
    // with `onExit = onModuleExit`.
    const Host = defineComponent({
      setup() {
        // `localOnExit` is a MaybeRefOrGetter slot, so a handler is supplied as
        // a getter returning it (a bare function would be invoked as a getter).
        const exit = useModuleExit<typeof exits>("review", "review", {
          tabId: "t-ctx",
          localOnExit: () => localOnExit,
        });
        return () =>
          h(
            "button",
            {
              onClick: () => {
                exit("confirmed", { id: "CTX-MT" });
              },
            },
            "confirm",
          );
      },
    });

    const wrapper = mount(JourneyProvider, {
      props: { runtime, onModuleExit: globalOnExit },
      slots: { default: () => h(Host) },
    });

    wrapper.get("button").trigger("click");

    const event = {
      moduleId: "review",
      entry: "review",
      exit: "confirmed",
      output: { id: "CTX-MT" },
      tabId: "t-ctx",
    };
    expect(localOnExit).toHaveBeenCalledWith(event);
    expect(globalOnExit).toHaveBeenCalledWith(event);
    // Both handlers fire for every exit — a shell can add global telemetry
    // without dropping per-host handling. Local runs before global.
    expect(localOnExit.mock.invocationCallOrder[0]!).toBeLessThan(
      globalOnExit.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps forwarding local exits when no provider-level onModuleExit is set", () => {
    const runtime = createJourneyRuntime([], { modules: { review: mod }, debug: false });
    const localOnExit = vi.fn();

    const Host = defineComponent({
      setup() {
        const exit = useModuleExit<typeof exits>("review", "review", {
          localOnExit: () => localOnExit,
        });
        return () =>
          h(
            "button",
            {
              onClick: () => {
                exit("confirmed", { id: "solo" });
              },
            },
            "confirm",
          );
      },
    });

    const wrapper = mount(JourneyProvider, {
      props: { runtime },
      slots: { default: () => h(Host) },
    });

    wrapper.get("button").trigger("click");

    expect(localOnExit).toHaveBeenCalledWith({
      moduleId: "review",
      entry: "review",
      exit: "confirmed",
      output: { id: "solo" },
    });
  });

  it("useJourneyContext returns null when no JourneyProvider is mounted", () => {
    let seen: JourneyProviderValue | null | undefined = undefined;
    const Probe = defineComponent({
      setup() {
        seen = useJourneyContext();
        return () => null;
      },
    });
    mount(Probe);
    expect(seen).toBeNull();
  });
});
