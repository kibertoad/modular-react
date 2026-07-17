import { computed, toRaw, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { InstanceId, JourneyRuntime } from "@modular-frontend/journeys-engine";
import {
  resolveStepSequence,
  type JourneyDefinition,
  type ModuleTypeMap,
  type ResolvedJourneyStep,
  type ResolveStepSequenceOptions,
} from "@modular-frontend/journeys-engine";
import { useInstanceSnapshot } from "./instance-hooks.js";
import { useJourneyContext } from "./provider.js";

export interface UseJourneyProgressOptions<TInput = unknown> {
  /**
   * Runtime the `instanceId` belongs to. Defaults to the one provided by a
   * surrounding `<JourneyProvider>`.
   */
  readonly runtime?: JourneyRuntime;
  /**
   * Forwarded to `resolveStepSequence` — chiefly `branch`, to linearize a
   * forking flow, and `input`, when the start step depends on it.
   */
  readonly sequence?: ResolveStepSequenceOptions<TInput>;
}

export interface JourneyProgress {
  /** 0-based position (`history.length`), so `0` on the first step. */
  readonly index: ComputedRef<number>;
  /** Resolved sequence length, or `null` when it can't be derived. */
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
  options: UseJourneyProgressOptions<TInput> = {},
): JourneyProgress {
  const ctx = useJourneyContext();
  // `toRaw` for the same reason the host/outlet do it — a runtime that arrived
  // through a reactive prop is a proxy, and the runtime keys on raw identity.
  const runtime = toRaw(options.runtime ?? ctx?.runtime ?? undefined) ?? null;

  const instance = useInstanceSnapshot(runtime, instanceId);

  // `definition` / `options` are plain values (not reactive), so the sequence
  // is resolved once at setup — the same read the React hook memoizes.
  const steps = resolveStepSequence(definition, options.sequence);

  const index = computed(() => (instance.value ? instance.value.history.length : 0));
  const total = computed(() => (steps.length > 0 ? steps.length : null));
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
