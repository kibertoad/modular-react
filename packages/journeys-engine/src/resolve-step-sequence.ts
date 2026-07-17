import type { JourneyStepMeta, ModuleTypeMap } from "@modular-frontend/core";
import type { JourneyDefinition } from "./types.js";
import { isAnnotatedTransition, isTerminalSentinel } from "./define-transition.js";

/**
 * One step in a resolved journey sequence — the `(module, entry)` identity plus
 * any declarative {@link JourneyStepMeta} the definition attached under
 * `steps[module][entry]`.
 */
export interface ResolvedJourneyStep {
  readonly module: string;
  readonly entry: string;
  /** `path` from the step's {@link JourneyStepMeta}, if declared. */
  readonly path?: string;
  /** `progressLabel` from the step's {@link JourneyStepMeta}, if declared. */
  readonly progressLabel?: string;
}

/** A bare `(module, entry)` reference — a candidate forward step. */
export interface StepSequenceRef {
  readonly module: string;
  readonly entry: string;
}

export interface ResolveStepSequenceOptions<TInput = unknown> {
  /**
   * Input handed to `definition.initialState` / `definition.start` to compute
   * the first step. Omit for void-input journeys. Ignored when {@link start}
   * is supplied.
   */
  readonly input?: TInput;
  /**
   * Explicit first step. Skips calling `initialState` / `start` — useful when
   * the start step is dynamic on input in a way that does not affect the
   * sequence, or when resolving a sub-sequence from a mid-flow step.
   */
  readonly start?: StepSequenceRef;
  /**
   * Fork resolver. When a step's transitions declare more than one distinct
   * forward `(module, entry)` target, the walk cannot linearize on its own —
   * this callback picks which branch to follow. Return one of `ctx.targets`
   * (identity not required — matched by `module` + `entry`), or `undefined` to
   * stop the sequence at this fork. Not called for steps with a single forward
   * target.
   */
  readonly branch?: (ctx: {
    readonly module: string;
    readonly entry: string;
    readonly targets: readonly StepSequenceRef[];
  }) => StepSequenceRef | undefined;
  /**
   * Hard cap on sequence length — a backstop against a pathological graph.
   * Default 256. The walk also stops on its own when it revisits a step
   * (cycle) or reaches a step with no forward target.
   */
  readonly maxSteps?: number;
}

const DEFAULT_MAX_STEPS = 256;

/**
 * Derive an ordered step list for a journey by walking its transition graph
 * statically, following the `targets` each {@link defineTransition} handler
 * declares. Returns the linear spine from the start step forward — for a
 * branching flow, pass `options.branch` to choose the path at each fork.
 *
 * This is the runtime companion to the catalog harvester's build-time
 * destination extraction: it lets an app derive URL-segment ordering and a
 * "Step X of N" total from the *one* place the flow is already encoded (the
 * transitions), deleting the hand-maintained ordered-step arrays that item 4
 * of the production-feedback tracker flagged as duplicated, drift-prone glue.
 *
 * **Requires annotated transitions.** The walk reads each handler's `targets`
 * (stamped by `defineTransition`). A step whose transitions are all *bare*
 * function handlers has no statically-known forward target, so the sequence
 * stops there. Terminal sentinels (`"complete"` / `"abort"` / `"invoke"`)
 * carry no next step and are skipped.
 *
 * Each returned step carries any `path` / `progressLabel` declared under
 * `definition.steps[module][entry]`.
 *
 * @example
 * ```ts
 * const steps = resolveStepSequence(checkout);
 * const total = steps.length;                    // "Step X of N"
 * const paths = steps.map((s) => s.path ?? `${s.module}/${s.entry}`);
 * ```
 */
export function resolveStepSequence<
  TModules extends ModuleTypeMap,
  TState,
  TInput,
  TOutput,
  TMeta extends { [K in keyof TMeta]: unknown },
>(
  definition: JourneyDefinition<TModules, TState, TInput, TOutput, TMeta>,
  options: ResolveStepSequenceOptions<TInput> = {},
): readonly ResolvedJourneyStep[] {
  const maxSteps = normalizeMaxSteps(options.maxSteps);

  let current: StepSequenceRef | undefined =
    options.start ?? deriveStart(definition, options.input);

  const sequence: ResolvedJourneyStep[] = [];
  const visited = new Set<string>();

  while (current && sequence.length < maxSteps) {
    const key = stepKey(current.module, current.entry);
    if (visited.has(key)) break; // cycle — a linear spine visits each step once
    visited.add(key);

    const meta = readStepMeta(definition, current.module, current.entry);
    sequence.push({
      module: current.module,
      entry: current.entry,
      ...(meta?.path !== undefined ? { path: meta.path } : {}),
      ...(meta?.progressLabel !== undefined ? { progressLabel: meta.progressLabel } : {}),
    });

    const targets = forwardTargets(definition, current.module, current.entry);
    if (targets.length === 0) break;

    current =
      targets.length === 1
        ? targets[0]
        : options.branch?.({ module: current.module, entry: current.entry, targets });
  }

  return sequence;
}

function normalizeMaxSteps(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return DEFAULT_MAX_STEPS;
  return Math.floor(value);
}

function stepKey(module: string, entry: string): string {
  // JSON-encode the pair so a module or entry name that itself contains the
  // separator can't collide two distinct steps onto the same visited key.
  return JSON.stringify([module, entry]);
}

/**
 * Compute the first step by running the definition's `initialState` + `start`.
 * These are author-supplied pure factories; a journey whose `initialState`
 * needs a non-void input must pass it via `options.input`.
 */
function deriveStart(definition: AnyDefinition, input: unknown): StepSequenceRef {
  const state = definition.initialState(input);
  const spec = definition.start(state, input);
  return { module: spec.module, entry: spec.entry };
}

function readStepMeta(
  definition: AnyDefinition,
  module: string,
  entry: string,
): JourneyStepMeta | undefined {
  const steps = definition.steps as
    | Record<string, Record<string, JourneyStepMeta | undefined> | undefined>
    | undefined;
  return steps?.[module]?.[entry];
}

/**
 * Distinct forward `(module, entry)` targets declared by any annotated exit
 * handler on `transitions[module][entry]`. Bare handlers and terminal
 * sentinels contribute nothing. Order follows first-declaration order across
 * exits, deduped.
 */
function forwardTargets(
  definition: AnyDefinition,
  module: string,
  entry: string,
): readonly StepSequenceRef[] {
  const transitions = definition.transitions as
    | Record<string, Record<string, Record<string, unknown> | undefined> | undefined>
    | undefined;
  const perEntry = transitions?.[module]?.[entry];
  if (!perEntry) return [];

  const refs: StepSequenceRef[] = [];
  const seen = new Set<string>();
  for (const [exitName, handler] of Object.entries(perEntry)) {
    // `allowBack` is a sibling boolean flag on the per-entry map, not a handler.
    if (exitName === "allowBack") continue;
    if (!isAnnotatedTransition(handler)) continue;
    for (const target of handler.targets) {
      if (isTerminalSentinel(target)) continue;
      const key = stepKey(target.module, target.entry);
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ module: target.module, entry: target.entry });
    }
  }
  return refs;
}

/**
 * Internal alias for the generic-erased definition — `resolveStepSequence`
 * walks the definition structurally (module ids and entry names are strings on
 * the wire), so the helpers operate on the erased shape to avoid threading the
 * five generics through every internal call.
 */
type AnyDefinition = JourneyDefinition<any, any, any, any, any>;
