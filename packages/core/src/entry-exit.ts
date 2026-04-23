import type {
  EntryPointMap,
  ExitPointMap,
  ExitPointSchema,
  InputSchema,
  ModuleDescriptor,
  ModuleEntryPoint,
} from "./types.js";

/**
 * Type-only brand used to declare the shape of an entry input or exit output
 * without any runtime cost. Apps that want real runtime validation can wire
 * a schema library (zod, valibot) through the registry's `validateInput` hook.
 */
export const schema = <T>(): InputSchema<T> => ({}) as InputSchema<T>;

/**
 * Identity helper used to preserve inference of `TInput` on a single
 * {@link ModuleEntryPoint}. The descriptor types only flow through correctly
 * when the entry is a typed const value.
 */
export const defineEntry = <TInput>(entry: ModuleEntryPoint<TInput>): ModuleEntryPoint<TInput> =>
  entry;

/**
 * Type-only brand that preserves inference of `TOutput` on a single
 * {@link ExitPointSchema}. Called with no arguments and no runtime cost —
 * the returned object is an empty placeholder tagged with the output type.
 *
 * ```ts
 * const exits = {
 *   noDebtFound:      defineExit<{ customerId: string }>(),
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
      if (typeof entry.component !== "function") {
        issues.push(
          `entry "${name}" must declare a React component (got ${typeof entry.component})`,
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
