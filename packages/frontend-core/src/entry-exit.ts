import type { StandardSchemaV1 } from "@standard-schema/spec";
import type {
  EagerModuleEntryPoint,
  EntryPointMap,
  ExitContract,
  ExitPointMap,
  ExitPointSchema,
  InputSchema,
  LazyModuleEntryPoint,
  ModuleDescriptor,
  ModuleEntryPoint,
  MountKind,
  StandardSchemaLike,
} from "./types.js";

/**
 * Type-only brand used to declare the shape of an entry input or exit output
 * without any runtime cost. Apps that want real runtime validation can wire
 * a schema library (zod, valibot) through the registry's `validateInput` hook.
 */
export const schema = <T>(): InputSchema<T> => ({}) as InputSchema<T>;

/**
 * The factory shape an entry's `buildInput` must have — `state` is typed
 * `unknown` at the module surface (modules don't know their host journey;
 * see {@link buildInputFor}). Aliased so the `defineEntry` overloads can
 * both *require* it (buildInput-present) and re-state it on the return
 * type as a non-optional member.
 */
type BuildInputFn<TInput> = (state: unknown) => TInput;

/**
 * Identity helper used to preserve inference of `TInput` on a single
 * {@link ModuleEntryPoint}. The descriptor types only flow through correctly
 * when the entry is a typed const value. Overloaded so eager and lazy entries
 * keep their narrow union member through the call, the literal `mountKinds`
 * tuple is captured when the caller supplies it, AND the *presence* of
 * `buildInput` survives into the return type.
 *
 * **Why two overloads per shape for `mountKinds`** (with / without):
 * a `const TMountKinds` generic only captures literally when the
 * corresponding field is non-optional. Splitting into a "mountKinds is
 * required here" overload and a "mountKinds is absent here" overload
 * makes the const inference fire for the former while keeping ergonomic
 * default-wide behavior for the latter. Without the split, an optional
 * `mountKinds?: TMountKinds` widens TMountKinds to the constraint
 * (`readonly MountKind[]`) regardless of the argument, defeating the
 * compile-time per-host filtering downstream consumers rely on.
 *
 * **Why two overloads per shape for `buildInput`** (present / absent):
 * `buildInput` is declared optional on {@link ModuleEntryPointBase}, so a
 * plain return type of `EagerModuleEntryPoint<TInput>` *erases* whether the
 * caller actually supplied it — an optional member is structurally
 * indistinguishable from an absent one. The buildInput-present overloads
 * re-state `buildInput` as a **required** member on the return type; that
 * required member is what `StepSpec`'s `EntryDeclaresBuildInput` check keys
 * on to make a transition's `input` optional for self-building entries.
 * The buildInput-absent overloads (`buildInput?: undefined`) return the
 * plain shape, keeping `input` required for ordinary entries.
 *
 * Eager/lazy × mountKinds(present/absent) × buildInput(present/absent) =
 * eight precise overloads; mountKinds-present pairs come first so `const`
 * capture still fires, present-before-absent within each pair.
 *
 * **Why a trailing eager/lazy catch-all pair**: every precise arm pins
 * `buildInput` to either a required {@link BuildInputFn} or `?: undefined`.
 * A caller whose entry is *pretyped* (declared as `EagerModuleEntryPoint`
 * / `LazyModuleEntryPoint`, where `buildInput` is the base interface's
 * optional member) or whose `buildInput` is conditionally typed
 * (`((state: unknown) => TInput) | undefined`) is assignable to *neither*
 * arm — so without a fallback those callers would be a hard compile
 * error, a regression from the pre-`buildInput` single overload. The
 * catch-all accepts the plain shape and returns it unchanged: `buildInput`
 * presence is **erased**, so `StepSpec`'s `input` stays required for them
 * (the safe default). Definite literals never reach the catch-all — they
 * match a precise arm first and keep their `buildInput` presence.
 */
// -- eager, mountKinds present --
export function defineEntry<TInput, const TMountKinds extends readonly MountKind[]>(
  entry: EagerModuleEntryPoint<TInput> & {
    readonly mountKinds: TMountKinds;
    readonly buildInput: BuildInputFn<TInput>;
  },
): EagerModuleEntryPoint<TInput> & {
  readonly mountKinds: TMountKinds;
  readonly buildInput: BuildInputFn<TInput>;
};
export function defineEntry<TInput, const TMountKinds extends readonly MountKind[]>(
  entry: EagerModuleEntryPoint<TInput> & {
    readonly mountKinds: TMountKinds;
    readonly buildInput?: undefined;
  },
): EagerModuleEntryPoint<TInput> & { readonly mountKinds: TMountKinds };
// -- lazy, mountKinds present --
export function defineEntry<TInput, const TMountKinds extends readonly MountKind[]>(
  entry: LazyModuleEntryPoint<TInput> & {
    readonly mountKinds: TMountKinds;
    readonly buildInput: BuildInputFn<TInput>;
  },
): LazyModuleEntryPoint<TInput> & {
  readonly mountKinds: TMountKinds;
  readonly buildInput: BuildInputFn<TInput>;
};
export function defineEntry<TInput, const TMountKinds extends readonly MountKind[]>(
  entry: LazyModuleEntryPoint<TInput> & {
    readonly mountKinds: TMountKinds;
    readonly buildInput?: undefined;
  },
): LazyModuleEntryPoint<TInput> & { readonly mountKinds: TMountKinds };
// -- eager, mountKinds absent --
export function defineEntry<TInput>(
  entry: EagerModuleEntryPoint<TInput> & {
    readonly mountKinds?: undefined;
    readonly buildInput: BuildInputFn<TInput>;
  },
): EagerModuleEntryPoint<TInput> & { readonly buildInput: BuildInputFn<TInput> };
export function defineEntry<TInput>(
  entry: EagerModuleEntryPoint<TInput> & {
    readonly mountKinds?: undefined;
    readonly buildInput?: undefined;
  },
): EagerModuleEntryPoint<TInput>;
// -- lazy, mountKinds absent --
export function defineEntry<TInput>(
  entry: LazyModuleEntryPoint<TInput> & {
    readonly mountKinds?: undefined;
    readonly buildInput: BuildInputFn<TInput>;
  },
): LazyModuleEntryPoint<TInput> & { readonly buildInput: BuildInputFn<TInput> };
export function defineEntry<TInput>(
  entry: LazyModuleEntryPoint<TInput> & {
    readonly mountKinds?: undefined;
    readonly buildInput?: undefined;
  },
): LazyModuleEntryPoint<TInput>;
// -- catch-all: pretyped entries / conditionally-typed `buildInput` --
// Falls through here when `buildInput` is neither a definite function nor
// definitely absent (see the JSDoc above). Returns the plain shape.
export function defineEntry<TInput>(
  entry: EagerModuleEntryPoint<TInput>,
): EagerModuleEntryPoint<TInput>;
export function defineEntry<TInput>(
  entry: LazyModuleEntryPoint<TInput>,
): LazyModuleEntryPoint<TInput>;
export function defineEntry<TInput>(entry: ModuleEntryPoint<TInput>): ModuleEntryPoint<TInput> {
  return entry;
}

/**
 * Typed wrapper for `defineEntry({ buildInput })` that bakes the
 * hosting journey's `TState` into the factory's `state` parameter.
 * Curried so callers spell `TState` explicitly while `TInput` infers
 * from the function body. The visual shape matches `defineJourney`'s
 * curry — explicit generics in the outer call, inferred ones in the
 * inner — though the motivation differs: `defineJourney` uses two
 * calls to work around TypeScript's lack of partial inference, while
 * `buildInputFor` uses them so `TInput` infers cleanly from the
 * function body alone.
 *
 * ```ts
 * defineEntry({
 *   component: NameForm,
 *   input: schema<{ previousName: string }>(),
 *   buildInput: buildInputFor<ProjectState>()((state) => ({
 *     previousName: state.draftName,
 *   })),
 * });
 * ```
 *
 * **What this catches**: the inline-annotation alternative —
 * `buildInput: (state: ProjectState) => …` — relies on TypeScript
 * allowing a narrower-parameter function to assign to the entry's
 * declared `(state: unknown) => TInput`. Under `strictFunctionTypes` (or
 * stricter consumer configs) that assignment can fail; this helper
 * does the unknown→TState cast inside its body, so the *outer* signature
 * always matches the entry's declared shape regardless of consumer
 * strictness.
 *
 * **What this does NOT catch**: a mismatch between the spelled `TState`
 * and the host journey's actual state type. Modules are
 * journey-agnostic — nothing at the module-declaration site knows which
 * journey will run them. Annotate carefully; integration / harness
 * tests are the safety net for the cross-cut.
 */
export const buildInputFor =
  <TState>() =>
  <TInput>(fn: (state: TState) => TInput): ((state: unknown) => TInput) =>
  (state: unknown) =>
    fn(state as TState);

/**
 * Type-only brand that preserves inference of `TOutput` on a single
 * {@link ExitPointSchema}. Called with no arguments and no runtime cost —
 * the returned object is an empty placeholder tagged with the output type.
 *
 * ```ts
 * const exits = {
 *   profileComplete:  defineExit<{ customerId: string; hint: PlanHint }>(),
 *   cancelled:        defineExit(),
 * } as const;
 * ```
 *
 * Apps that need runtime validation should wire zod/valibot through the
 * registry's `validateInput` hook — `defineExit` itself stays declarative.
 */
export function defineExit<TOutput = void>(): ExitPointSchema<TOutput> {
  return {} as ExitPointSchema<TOutput>;
}

/**
 * Define a shared exit contract — an `ExitPointSchema` with a stable
 * identity (`kind`) and an optional Standard Schema for runtime payload
 * validation. Two modules that emit the same kind of exit can both
 * reference the same contract value as their exit's schema; the journey
 * runtime then treats them uniformly under wildcard transitions and
 * (when a schema is supplied) validates payloads at every emit.
 *
 * Two call shapes:
 *
 * ```ts
 * // Type-only — declared TOutput, zero runtime cost. Equivalent to
 * // `defineExit<T>()` plus a stable identity for cross-module sharing.
 * const errorContract = defineExitContract<{ code: string }>("error");
 *
 * // Schema form — TOutput inferred from the schema (any
 * // StandardSchemaV1 implementation: Zod, Valibot, ArkType, ...).
 * // Runtime validates payloads at emit time; bad payloads abort the
 * // journey with reason `exit-payload-invalid`.
 * const cancelledContract = defineExitContract(
 *   "cancelled",
 *   z.object({ reason: z.string() }),
 * );
 * ```
 *
 * Modules opt in by referencing the contract value as their exit's
 * schema:
 *
 * ```ts
 * const exits = {
 *   cancelled: cancelledContract,    // shared
 *   error: errorContract,            // shared
 *   finished: defineExit<{ profileId: string }>(),
 * } as const;
 * ```
 */
export function defineExitContract<TOutput>(kind: string): ExitContract<TOutput>;
export function defineExitContract<TSchema extends StandardSchemaV1>(
  kind: string,
  schema: TSchema,
): ExitContract<StandardSchemaV1.InferOutput<TSchema>>;
export function defineExitContract(kind: string, schema?: StandardSchemaV1): ExitContract<unknown> {
  return schema ? { kind, schema: schema as StandardSchemaLike<unknown> } : { kind };
}

/**
 * Type predicate distinguishing an `ExitContract` from a plain
 * `ExitPointSchema`. Used by the journey runtime to decide whether to
 * apply schema validation at emit time and by validators to enforce
 * cross-module shape consistency under wildcard transitions.
 *
 * `kind: string` is the discriminator: `defineExit()` returns `{}` (no
 * `kind`), so a string `kind` field reliably identifies a contract.
 */
export function isExitContract(schema: unknown): schema is ExitContract<unknown> {
  return (
    typeof schema === "object" &&
    schema !== null &&
    typeof (schema as { kind?: unknown }).kind === "string"
  );
}

/**
 * Structural validation for a module's entry/exit declarations. Accumulates
 * all issues into a single error — callers wrap the module id around the
 * aggregated message.
 */
export function validateModuleEntryExit(
  mod: ModuleDescriptor<any, any, any, any>,
): readonly string[] {
  const issues: string[] = [];
  const entryPoints = mod.entryPoints as EntryPointMap | undefined;
  const exitPoints = mod.exitPoints as ExitPointMap | undefined;

  if (entryPoints) {
    for (const [name, entry] of Object.entries(entryPoints)) {
      if (!entry || typeof entry !== "object") {
        issues.push(`entry "${name}" is not an object`);
        continue;
      }
      // A component may be a function (React function component, Vue functional
      // component) or a non-null object (a Vue SFC / `defineComponent` options
      // object, a `React.memo` / `forwardRef` result). The core is
      // framework-neutral, so accept both shapes; each binding's renderer knows
      // how to mount its own component kind.
      const componentValue = (entry as { component?: unknown }).component;
      const hasComponent =
        typeof componentValue === "function" ||
        (typeof componentValue === "object" && componentValue !== null);
      const hasLazy = typeof (entry as { lazy?: unknown }).lazy === "function";
      if (!hasComponent && !hasLazy) {
        issues.push(
          `entry "${name}" must declare a component (function or component object) or a lazy importer (got component: ${typeof (entry as { component?: unknown }).component}, lazy: ${typeof (entry as { lazy?: unknown }).lazy})`,
        );
      } else if (hasComponent && hasLazy) {
        issues.push(
          `entry "${name}" declares both \`component\` and \`lazy\` — these are mutually exclusive`,
        );
      }
      const allowBack = entry.allowBack;
      if (
        allowBack !== undefined &&
        allowBack !== false &&
        allowBack !== "preserve-state" &&
        allowBack !== "rollback"
      ) {
        issues.push(
          `entry "${name}" has invalid allowBack value ${JSON.stringify(allowBack)} — expected false, 'preserve-state' or 'rollback'`,
        );
      }
    }
  }

  if (exitPoints) {
    for (const [name, exit] of Object.entries(exitPoints)) {
      if (exit !== undefined && (exit === null || typeof exit !== "object")) {
        issues.push(`exit "${name}" must be an object or undefined`);
      }
    }
  }

  return issues;
}
