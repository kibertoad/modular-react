import { defineComponent, h, type Component } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import type { NavigationItemBase } from "@modular-frontend/core";
import { useModuleExit } from "@modular-vue/vue";

import { defineJourney, JourneyValidationError } from "@modular-frontend/journeys-engine";
import type { AnyJourneyDefinition, JourneyRuntime } from "@modular-frontend/journeys-engine";
import { journeysPlugin } from "./plugin.js";
import type { JourneysPluginExtension } from "./plugin.js";
import { journeyKey, useJourneyContext } from "./provider.js";

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

/** Build the plugin and register the review journey through its `extend()` surface. */
function setup(options?: Parameters<typeof journeysPlugin>[0]) {
  const plugin = journeysPlugin(options);
  const ext = plugin.extend({ markDirty: () => {} }) as JourneysPluginExtension;
  return { plugin, ext };
}

describe("journeysPlugin", () => {
  it("names itself 'journeys'", () => {
    expect(journeysPlugin().name).toBe("journeys");
  });

  it("appProvides contributes the runtime under journeyKey for the install path", () => {
    const onModuleExit = vi.fn();
    const plugin = journeysPlugin({ onModuleExit });
    const runtime = { __fake: true } as unknown as JourneyRuntime;

    const bindings = plugin.appProvides?.({ runtime });
    expect(bindings).toHaveLength(1);
    expect(bindings?.[0]!.key).toBe(journeyKey);
    expect(bindings?.[0]!.value).toEqual({ runtime, onModuleExit });
  });

  it("registerJourney validates the definition shape and rejects malformed journeys", () => {
    const { ext } = setup();
    expect(() => ext.registerJourney({} as unknown as AnyJourneyDefinition)).toThrow(
      JourneyValidationError,
    );
  });

  it("validate passes when the referenced modules are present", () => {
    const { plugin, ext } = setup();
    ext.registerJourney(journey);
    expect(() => plugin.validate?.({ modules: [mod] })).not.toThrow();
  });

  it("validate fails when a referenced module is missing", () => {
    const { plugin, ext } = setup();
    ext.registerJourney(journey);
    expect(() => plugin.validate?.({ modules: [] })).toThrow(JourneyValidationError);
  });

  it("onResolve produces a JourneyRuntime that can start the registered journey", () => {
    const { plugin, ext } = setup();
    ext.registerJourney(journey);
    const runtime = plugin.onResolve?.({
      modules: [mod],
      moduleDescriptors: { review: mod },
      debug: false,
    }) as JourneyRuntime;

    const id = runtime.start("j", { customerId: "R-1" });
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("review");
  });

  it("contributeNavigation emits the default launcher item for nav-carrying journeys", () => {
    const { plugin, ext } = setup();
    ext.registerJourney(journey, { nav: { label: "Review", group: "flows", order: 2 } });
    const items = plugin.contributeNavigation?.({ modules: [mod] });
    expect(items).toEqual([
      {
        label: "Review",
        to: "",
        group: "flows",
        order: 2,
        action: { kind: "journey-start", journeyId: "j" },
      },
    ]);
  });

  it("contributeNavigation skips journeys without a nav option", () => {
    const { plugin, ext } = setup();
    ext.registerJourney(journey);
    expect(plugin.contributeNavigation?.({ modules: [mod] })).toEqual([]);
  });

  it("contributeNavigation routes items through a buildNavItem adapter when provided", () => {
    interface TypedNavItem extends NavigationItemBase {
      readonly label: string;
      readonly to: string;
      readonly section: string;
    }
    const { plugin, ext } = setup({
      buildNavItem: (defaults, raw): TypedNavItem => ({
        label: defaults.label,
        to: defaults.to,
        section: `journey:${raw.journeyId}`,
      }),
    });
    ext.registerJourney(journey, { nav: { label: "Review" } });
    expect(plugin.contributeNavigation?.({ modules: [mod] })).toEqual([
      { label: "Review", to: "", section: "journey:j" },
    ]);
  });

  it("providers contributes a Vue provider that exposes the runtime and forwards module exits", () => {
    const onModuleExit = vi.fn();
    const { plugin, ext } = setup({ onModuleExit });
    ext.registerJourney(journey);
    const runtime = plugin.onResolve?.({
      modules: [mod],
      moduleDescriptors: { review: mod },
      debug: false,
    }) as JourneyRuntime;

    const [Provider] = plugin.providers?.({ runtime }) ?? [];
    expect(Provider).toBeTruthy();

    let seenRuntime: JourneyRuntime | undefined;
    const Host = defineComponent({
      setup() {
        seenRuntime = useJourneyContext()?.runtime;
        const exit = useModuleExit<typeof exits>("review", "review", { tabId: "tab-1" });
        return () =>
          h(
            "button",
            {
              onClick: () => {
                exit("confirmed", { id: "X" });
              },
            },
            "confirm",
          );
      },
    });

    const wrapper = mount(Provider as Component, {
      slots: { default: () => h(Host) },
    });

    // The plugin's provider makes the runtime injectable app-wide.
    expect(seenRuntime).toBe(runtime);

    wrapper.get("button").trigger("click");
    // options.onModuleExit is wired as the ModuleExitProvider dispatcher.
    expect(onModuleExit).toHaveBeenCalledWith({
      moduleId: "review",
      entry: "review",
      exit: "confirmed",
      output: { id: "X" },
      tabId: "tab-1",
    });
  });
});
