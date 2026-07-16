import { defineComponent, h, type VNode } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import {
  separateDeps,
  type ModuleEntry,
  type ReactiveService,
  type Store,
} from "@modular-frontend/core";
import { provideModules, provideSharedDependencies, provideSlots } from "@modular-vue/vue";
import type { ModuleDescriptor } from "@modular-vue/core";
import {
  createJourneyRuntime,
  JourneyOutlet,
  type JourneyDefinition,
  type JourneyRegisterOptions,
  type JourneyRuntime,
  type ModuleTypeMap,
  type TerminalOutcome,
} from "@modular-vue/journeys";

export interface RenderJourneyOptions<TSharedDependencies extends Record<string, any>, TInput> {
  readonly modules: readonly ModuleDescriptor<TSharedDependencies, any, any, any>[];
  readonly input: TInput;
  readonly deps: Partial<{
    [K in keyof TSharedDependencies]:
      | Store<TSharedDependencies[K]>
      | ReactiveService<TSharedDependencies[K]>
      | TSharedDependencies[K];
  }>;
  /** Optional persistence + onTransition forwarded into the runtime. */
  readonly journeyOptions?: JourneyRegisterOptions;
  readonly loadingFallback?: VNode | (() => VNode);
  readonly onFinished?: (outcome: TerminalOutcome) => void;
}

export interface RenderJourneyResult {
  /** The mounted tree — `@vue/test-utils` `VueWrapper` (see deviation note). */
  readonly wrapper: VueWrapper;
  readonly runtime: JourneyRuntime;
  readonly instanceId: string;
}

/**
 * Mount `<JourneyOutlet>` inside a minimal set of modular injection contexts so
 * a journey definition can be exercised end-to-end in tests. Returns the mounted
 * wrapper plus the live runtime + instance id for assertions. The Vue analog of
 * the React `@react-router-modules/testing` `renderJourney`.
 *
 * Deviations from the React source, both forced by the framework:
 *
 * - **Returns a `{ wrapper, runtime, instanceId }` object** where `wrapper` is a
 *   `@vue/test-utils` `VueWrapper` (the repo-wide Vue test primitive), rather
 *   than a `@testing-library/react` `RenderResult` merged with the extras.
 *   `mount` is the faithful analog of `render`.
 * - **The three React context-provider JSX wrappers**
 *   (`<SharedDependenciesContext><SlotsContext><ModulesContext>`) become one
 *   `defineComponent` wrapper whose `setup()` calls the `provide*` helper
 *   analogs — the injection-key equivalents (decision D4).
 *
 * The runtime is handed to `<JourneyOutlet>` via its `runtime` prop, so no
 * `<JourneyProvider>` wrapper is needed for the outlet to resolve the runtime.
 */
export function renderJourney<
  TModules extends ModuleTypeMap,
  TState,
  TInput,
  TSharedDependencies extends Record<string, any> = Record<string, any>,
>(
  definition: JourneyDefinition<TModules, TState, TInput>,
  options: RenderJourneyOptions<TSharedDependencies, TInput>,
): RenderJourneyResult {
  const { stores, services, reactiveServices } = separateDeps(
    options.deps as Record<string, unknown>,
  );

  const moduleDescriptors: Record<string, ModuleDescriptor<any, any, any, any>> = {};
  const moduleEntries: ModuleEntry[] = [];
  for (const mod of options.modules) {
    moduleDescriptors[mod.id] = mod;
    moduleEntries.push({
      id: mod.id,
      version: mod.version,
      meta: mod.meta,
      component: mod.component,
      zones: mod.zones,
    });
  }

  const runtime = createJourneyRuntime(
    [{ definition: definition as any, options: options.journeyOptions }],
    {
      modules: moduleDescriptors,
      debug: false,
    },
  );
  const instanceId = runtime.start(definition.id, options.input);

  const Wrapper = defineComponent({
    name: "RenderJourneyWrapper",
    setup() {
      provideSharedDependencies({ stores, services, reactiveServices });
      provideSlots({});
      provideModules(moduleEntries);
      return () =>
        h(JourneyOutlet, {
          runtime,
          instanceId,
          modules: moduleDescriptors,
          loadingFallback: options.loadingFallback,
          onFinished: options.onFinished,
        });
    },
  });

  const wrapper = mount(Wrapper);
  return { wrapper, runtime, instanceId };
}
