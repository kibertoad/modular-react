import { useMemo } from "react";
import type { InstanceId, JourneyRuntime } from "@modular-frontend/journeys-engine";
import {
  resolveStepSequence,
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
   * Runtime the `instanceId` belongs to. Defaults to the one from a
   * surrounding `<JourneyProvider>`. Pass explicitly to read progress for an
   * instance on a runtime other than the ambient one.
   */
  readonly runtime?: JourneyRuntime;
}

/**
 * Options for {@link useJourneyProgress}.
 *
 * `sequence` is forwarded to `resolveStepSequence` — most importantly `branch`,
 * to linearize a forking flow, and `input`, when the start step depends on it.
 * The sequence is memoized on this object's identity, so pass a stable
 * reference (e.g. a module-level constant or a `useMemo`) rather than a fresh
 * literal each render if you want to avoid re-walking the graph per render.
 *
 * Mirroring `resolveStepSequence`, `sequence` is optional for a void-input
 * journey but required (carrying `input` or `start`) when the journey's
 * `initialState` / `start` need a non-void input.
 */
export type UseJourneyProgressOptions<TInput = unknown> = UseJourneyProgressBase &
  ([TInput] extends [void]
    ? { readonly sequence?: ResolveStepSequenceOptions<TInput> }
    : { readonly sequence: ResolveStepSequenceOptions<TInput> });

/**
 * Trailing options argument for {@link useJourneyProgress}: optional for a
 * void-input journey, required when the journey needs a non-void input so the
 * mandatory `sequence.input` / `sequence.start` can't be omitted.
 */
export type UseJourneyProgressArgs<TInput> = [TInput] extends [void]
  ? [options?: UseJourneyProgressOptions<TInput>]
  : [options: UseJourneyProgressOptions<TInput>];

export interface JourneyProgress {
  /**
   * 0-based position in the flow — `history.length`, so `0` on the first step.
   * Matches `useJourneyHost`'s `stepIndex`. Render "Step {index + 1} of {total}".
   *
   * Note `index` tracks the *live* instance while `total` comes from the
   * *statically-resolved* spine, so when the runtime path diverges from the
   * resolved one (a fork walked with a different `branch`, or steps past an
   * unannotated transition) `index` can reach or exceed `total`. Clamp at the
   * call site if you render a bounded stepper.
   */
  readonly index: number;
  /**
   * Total number of steps in the resolved sequence — the "N" in "Step X of N".
   *
   * Best-effort: it counts the statically-walkable spine `resolveStepSequence`
   * returns from the start step, which is a *partial* total when the flow forks
   * without a `branch` resolver, stops at an unannotated (bare-function)
   * transition, or is cut by `maxSteps`. It does not depend on a live instance —
   * a definition with a derivable start always yields at least `1`. `null` only
   * when no step at all can be resolved (an empty sequence).
   */
  readonly total: number | null;
  /**
   * `progressLabel` of the step the instance is currently on, if the matching
   * resolved step declared one. `null` otherwise.
   */
  readonly label: string | null;
  /** The full resolved sequence, so callers can render breadcrumbs / a stepper. */
  readonly steps: readonly ResolvedJourneyStep[];
}

/**
 * Progress for a running journey instance — the `{ index, total }` pair item 4
 * of the production-feedback tracker asked for, plus the current step's label
 * and the full resolved sequence.
 *
 * `index` comes from the live instance (`history.length`, so it rewinds when
 * the journey does); `total` and `label` come from `resolveStepSequence`, which
 * walks the definition's transition graph. Because the total is derived from
 * the one place the flow is encoded, there is no second ordered-step array to
 * keep in sync — the duplication item 4 flagged.
 *
 * The sequence is memoized on `definition` + `options.sequence`; for a forking
 * flow, pass `options.sequence.branch` so the total reflects the chosen path.
 *
 * @example
 * ```tsx
 * function CheckoutRoute() {
 *   const { instanceId } = useJourneyHost(checkoutHandle, { cartId });
 *   const { index, total, label } = useJourneyProgress(instanceId, checkoutDef);
 *   return (
 *     <>
 *       {total != null && <Progress value={index + 1} max={total} label={label} />}
 *       {instanceId && <JourneyOutlet instanceId={instanceId} />}
 *     </>
 *   );
 * }
 * ```
 */
export function useJourneyProgress<
  TModules extends ModuleTypeMap,
  TState,
  TInput,
  TOutput,
  TMeta extends { [K in keyof TMeta]: unknown },
>(
  instanceId: InstanceId | null,
  definition: JourneyDefinition<TModules, TState, TInput, TOutput, TMeta>,
  ...[options]: UseJourneyProgressArgs<TInput>
): JourneyProgress {
  const opts = (options ?? {}) as UseJourneyProgressBase & {
    readonly sequence?: ResolveStepSequenceOptions<TInput>;
  };
  const context = useJourneyContext();
  const runtime = opts.runtime ?? context?.runtime ?? null;

  const instance = useInstanceSnapshot(runtime, instanceId);

  const sequenceOptions = opts.sequence;
  const steps = useMemo(
    // The tuple cast localizes the same "TInput is generic here" erasure the
    // engine documents: `sequenceOptions` already satisfies the input-or-start
    // requirement via `UseJourneyProgressOptions`, so forward it as-is.
    () =>
      resolveStepSequence(
        definition,
        ...((sequenceOptions === undefined
          ? []
          : [sequenceOptions]) as StepSequenceOptionsArg<TInput>),
      ),
    [definition, sequenceOptions],
  );

  const index = instance ? instance.history.length : 0;
  const total = steps.length > 0 ? steps.length : null;

  const current = instance?.step;
  const label =
    current != null
      ? (steps.find((s) => s.module === current.moduleId && s.entry === current.entry)
          ?.progressLabel ?? null)
      : null;

  return { index, total, label, steps };
}
