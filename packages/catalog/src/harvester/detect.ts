import type { AnyModuleDescriptor } from "@modular-react/core";

/**
 * Duck-typed module descriptor predicate. Identifying a real
 * ModuleDescriptor at runtime requires checking for the presence of at
 * least one descriptor-shaped field beyond `id`/`version`, so a plain
 * `{ id, version }` object isn't mistaken for a module.
 *
 * The runtime never imports the actual class because there isn't one —
 * descriptors are plain objects produced by `defineModule`.
 */
export function isModuleDescriptor(value: unknown): value is AnyModuleDescriptor {
  if (!isObject(value)) return false;
  if (typeof value.id !== "string" || typeof value.version !== "string") return false;
  // Must contribute *something* — pure {id, version} is ambiguous and we'd
  // rather miss it than misclassify a journey or arbitrary export.
  return (
    "createRoutes" in value ||
    "navigation" in value ||
    "slots" in value ||
    "dynamicSlots" in value ||
    "component" in value ||
    "zones" in value ||
    "entryPoints" in value ||
    "exitPoints" in value ||
    "lifecycle" in value ||
    "requires" in value ||
    "optionalRequires" in value ||
    "startsJourneys" in value
  );
}

/**
 * Duck-typed journey definition predicate. A journey carries `transitions`
 * and `start` (function) plus `id`/`version` — these together uniquely
 * identify the shape vs. modules and unrelated exports.
 */
export function isJourneyDefinition(value: unknown): value is JourneyShape {
  if (!isObject(value)) return false;
  if (typeof value.id !== "string" || typeof value.version !== "string") return false;
  return (
    isObject(value.transitions) &&
    typeof value.start === "function" &&
    typeof value.initialState === "function"
  );
}

/**
 * Minimal structural view of a journey definition used by the harvester.
 * Avoids a runtime dep on `@modular-react/journeys` — the catalog only
 * needs to read fields, never to call the journey runtime.
 */
export interface JourneyShape {
  readonly id: string;
  readonly version: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly transitions: Readonly<Record<string, unknown>>;
  readonly invokes?: readonly { readonly id?: string }[];
  readonly moduleCompat?: Readonly<Record<string, string>>;
  readonly start: (...args: unknown[]) => unknown;
  readonly initialState: (...args: unknown[]) => unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
