import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { SharedDependenciesContext, separateDeps } from "@react-router-modules/core";
import type { ModuleDescriptor } from "@react-router-modules/core";
import type { ModuleEntry } from "@modular-react/core";
import { ModulesContext, SlotsContext } from "@modular-react/react";
import {
  createJourneyRuntime,
  JourneyOutlet,
  type JourneyDefinition,
  type JourneyRegisterOptions,
  type JourneyRuntime,
  type ModuleTypeMap,
} from "@modular-react/journeys";
import type { StoreApi } from "zustand";

export interface RenderJourneyOptions<TSharedDependencies extends Record<string, any>, TInput> {
  readonly modules: readonly ModuleDescriptor<TSharedDependencies, any, any, any>[];
  readonly input: TInput;
  readonly deps: Partial<{
    [K in keyof TSharedDependencies]: StoreApi<TSharedDependencies[K]> | TSharedDependencies[K];
  }>;
  /** Optional persistence + onTransition forwarded into the runtime. */
  readonly journeyOptions?: JourneyRegisterOptions;
  readonly loadingFallback?: ReactNode;
  readonly onFinished?: (outcome: {
    readonly status: "completed" | "aborted";
    readonly payload: unknown;
  }) => void;
}

export interface RenderJourneyResult extends RenderResult {
  readonly runtime: JourneyRuntime;
  readonly instanceId: string;
}

/**
 * Mount `<JourneyOutlet>` inside a minimal registry so a journey definition
 * can be exercised end-to-end in tests. Returns the testing-library handle
 * plus the live runtime + instance id for assertions.
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
    { modules: moduleDescriptors, debug: false },
  );
  const instanceId = runtime.start(definition.id, options.input);

  const result = render(
    <SharedDependenciesContext value={{ stores, services, reactiveServices }}>
      <SlotsContext value={{}}>
        <ModulesContext value={moduleEntries}>
          <JourneyOutlet
            runtime={runtime}
            instanceId={instanceId}
            modules={moduleDescriptors}
            loadingFallback={options.loadingFallback}
            onFinished={options.onFinished}
          />
        </ModulesContext>
      </SlotsContext>
    </SharedDependenciesContext>,
  );

  return Object.assign(result, { runtime, instanceId });
}
