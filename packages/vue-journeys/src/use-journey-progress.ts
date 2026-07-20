import { computed, toRaw, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { InstanceId, JourneyRuntime } from "@modular-frontend/journeys-engine";
import {
  resolveStepSequenceResult,
  type JourneyDefinition,
  type ModuleTypeMap,
  type ResolvedJourneyStep,
  type ResolveStepSequenceOptions,
  type StepSequenceOptionsArg,
} from "@modular-frontend/journeys-engine";
import { useInstanceSnapshot } from "./instance-hooks.js";
import { useJourneyContext } from "./provider.js";

interface UseJourneyProgressBase {
  /**
   * Runtime the `instanceId` belongs to. Defaults to the one provided by a
   * surrounding `<JourneyProvider>`.
   */
  readonly runtime?: JourneyRuntime;
}

/**
 * Options for {@link useJourneyProgress}.
 *
 * `sequence` is forwarded to `resolveStepSequence` — chiefly `branch`, to
 * linearize a forking flow, and `input`, when the start step depends on it.
 * Mirroring `resolveStepSequence`, `sequence` is optional for a void-input
 * journey but required (carrying `input` or `start`) when the journey's
 * `initialState` / `start` need a non-void input.
 */
export type UseJourneyProgressOptions<
  TInput = unknown,
  TModules extends ModuleTypeMap = ModuleTypeMap,
> = UseJourneyProgressBase &
  ([TInput] extends [void]
    ? { readonly sequence?: ResolveStepSequenceOptions<TInput, TModules> }
    : { readonly sequence: ResolveStepSequenceOptions<TInput, TModules> });

/**
 * Trailing options argument for {@link useJourneyProgress}: optional for a
 * void-input journey, required when the journey needs a non-void input so the
 * mandatory `sequence.input` / `sequence.start` can't be omitted.
 */
export type UseJourneyProgressArgs<TInput, TModules extends ModuleTypeMap = ModuleTypeMap> = [
  TInput,
] extends [void]
  ? [options?: UseJourneyProgressOptions<TInput, TModules>]
  : [options: UseJourneyProgressOptions<TInput, TModules>];

export interface JourneyProgress {
  /**
   * 0-based position in the flow, `0` on the first step. Derived from the
   * *resolved sequence* (the position of the live step within `steps`), so it
   * is correct under a `maxHistory` cap — unlike `history.length`, which the
   * runtime trims and which would then under-count later steps. Falls back to
   * `history.length` when the live step is off the resolved spine (a fork
   * walked with a different `branch`, or a step past an unannotated
   * transition), and can then reach or exceed `total`.
   */
  readonly index: ComputedRef<number>;
  /**
   * Resolved sequence length — the "N" in "Step X of N" — or `null` when it
   * cannot be trusted. A number only when the walk reached a genuine end of the
   * flow; `null` when the sequence is *partial* (fork without `branch`, a bare
   * or wildcard-only step, an `"invoke"` hand-off, a cycle, or the `maxSteps`
   * cap), because the walkable length is then only a lower bound and rendering
   * it as the total produces nonsense like "Step 2 of 1". Guard on `total`.
   */
  readonly total: ComputedRef<number | null>;
  /** `progressLabel` of the current step, or `null`. */
  readonly label: ComputedRef<string | null>;
  /** The full resolved sequence — for breadcrumbs / a stepper. */
  readonly steps: ComputedRef<readonly ResolvedJourneyStep[]>;
}

/**
 * Vue analog of the React `useJourneyProgress` (production-feedback item 4):
 * `{ index, total }` for a running instance, plus the current step's `label`
 * and the full resolved sequence, all as `ComputedRef`s.
 *
 * `index` tracks the live instance (`history.length`); `total` / `label` come
 * from `resolveStepSequence` walking the definition's transition graph, so the
 * total is derived from the one place the flow is encoded — no second
 * ordered-step array to keep in sync.
 *
 * `instanceId` accepts a plain value, a ref, or a getter (mirroring the other
 * instance composables). `definition` and `options` are read once at setup.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { instanceId } = useJourneyHost(checkoutHandle, { cartId })
 * const { index, total, label } = useJourneyProgress(instanceId, checkoutDef)
 * </script>
 * <template>
 *   <Progress v-if="total" :value="index + 1" :max="total" :label="label" />
 * </template>
 * ```
 */
export function useJourneyProgress<
  TModules extends ModuleTypeMap,
  TState,
  TInput,
  TOutput,
  TMeta extends { [K in keyof TMeta]: unknown },
>(
  instanceId: MaybeRefOrGetter<InstanceId | null>,
  definition: JourneyDefinition<TModules, TState, TInput, TOutput, TMeta>,
  ...[options]: UseJourneyProgressArgs<TInput, TModules>
): JourneyProgress {
  const opts = (options ?? {}) as UseJourneyProgressBase & {
    readonly sequence?: ResolveStepSequenceOptions<TInput, TModules>;
  };
  const ctx = useJourneyContext();
  // `toRaw` for the same reason the host/outlet do it — a runtime that arrived
  // through a reactive prop is a proxy, and the runtime keys on raw identity.
  const runtime = toRaw(opts.runtime ?? ctx?.runtime ?? undefined) ?? null;

  const instance = useInstanceSnapshot(runtime, instanceId);

  // `definition` / `options` are plain values (not reactive), so the sequence
  // is resolved once at setup — the same read the React hook memoizes. The
  // tuple cast localizes the engine's documented "TInput is generic here"
  // erasure; `opts.sequence` already satisfies the input-or-start requirement.
  const resolved = resolveStepSequenceResult(
    definition,
    ...((opts.sequence === undefined ? [] : [opts.sequence]) as StepSequenceOptionsArg<
      TInput,
      TModules
    >),
  );
  const steps = resolved.steps;

  const index = computed(() => {
    const current = instance.value?.step;
    // Position within the resolved spine — trim-immune, unlike `history.length`.
    const resolvedIndex =
      current != null
        ? steps.findIndex((s) => s.module === current.moduleId && s.entry === current.entry)
        : -1;
    if (resolvedIndex >= 0) return resolvedIndex;
    return instance.value ? instance.value.history.length : 0;
  });
  // Only a completed walk yields a trustworthy total; a partial spine would
  // render "Step 2 of 1" once the runtime advances past it.
  const total = computed(() => (resolved.complete && steps.length > 0 ? steps.length : null));
  const label = computed<string | null>(() => {
    const current = instance.value?.step;
    if (current == null) return null;
    return (
      steps.find((s) => s.module === current.moduleId && s.entry === current.entry)
        ?.progressLabel ?? null
    );
  });
  const stepsRef = computed(() => steps);

  return { index, total, label, steps: stepsRef };
}
