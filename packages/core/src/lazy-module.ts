import type { ModuleDescriptor } from "./types.js";

/**
 * Fields on a {@link ModuleDescriptor} that are only honored when the module
 * is registered eagerly. Lazy modules load after the registry has already
 * produced the navigation manifest, resolved slots, and module entries, so
 * these fields are silently dropped.
 *
 * Kept as a single source of truth for both the JSDoc on
 * `LazyModuleDescriptor` and the runtime warning emitted by each router
 * runtime when a lazy-loaded descriptor carries any of them.
 */
const IGNORED_LAZY_FIELDS = [
  "navigation",
  "slots",
  "dynamicSlots",
  "zones",
  "component",
  "meta",
  "requires",
  "optionalRequires",
  "lifecycle",
] as const;

/**
 * Warn at lazy-load time if the loaded descriptor carries fields that are
 * not honored for lazy modules. See {@link IGNORED_LAZY_FIELDS} for the
 * list and {@link LazyModuleDescriptor} for the rationale.
 *
 * The warning is a one-liner per module — it identifies the module by id
 * and lists the offending fields so the fix is obvious (move them to an
 * eagerly-registered module, or drop them).
 *
 * Pass `runtimeLabel` (e.g. `"@react-router-modules/runtime"`) so the
 * warning is greppable to the runtime that surfaced it.
 */
export function warnIgnoredLazyFields(
  descriptor: ModuleDescriptor<any, any, any, any>,
  runtimeLabel: string,
): void {
  const ignored = IGNORED_LAZY_FIELDS.filter(
    (f) => (descriptor as unknown as Record<string, unknown>)[f] !== undefined,
  );
  if (ignored.length === 0) return;
  // eslint-disable-next-line no-console
  console.warn(
    `[${runtimeLabel}] Lazy module "${descriptor.id}" declared fields that are ignored for lazy modules: ${ignored.join(", ")}. Only createRoutes() is honored on lazily-loaded descriptors — move these fields to an eagerly-registered module.`,
  );
}
