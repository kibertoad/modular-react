import { computed, type ComputedRef } from "vue";
import { useRoute } from "vue-router";
import { createRouteDataOverrideWarner, mergeRouteStaticData } from "@modular-frontend/core";

/**
 * Read merged `meta` values from the currently matched route hierarchy —
 * the "non-component zone" escape hatch.
 *
 * `useZones` is the component-typed channel: each value must be a
 * `UiComponent | undefined` so the shell can render it in a layout
 * region. That constraint is a useful rail 95% of the time, but it gets in
 * the way for non-component metadata the module wants to attach to a route —
 * a header variant enum, a page title string, an analytics event name, a
 * per-route feature flag. `useRouteData` is the relaxed-typing counterpart:
 * same deepest-wins merge over `route.meta`, no constraint on values.
 *
 * Two composables, two channels: keep components in `meta` fields consumed by
 * `useZones`, keep metadata in fields consumed by `useRouteData`. They can
 * co-exist in the same `meta` object because they read the same match
 * values; each composable only surfaces the keys you've declared in its type.
 *
 * @example
 * ```ts
 * // Declare both shapes explicitly — zones for renderable components,
 * // route data for everything else.
 * interface AppZones {
 *   HeaderActions?: UiComponent
 *   DetailPanel?: UiComponent
 * }
 * interface AppRouteData {
 *   headerVariant?: "portal" | "project" | "setup"
 *   pageTitle?: string
 * }
 *
 * // A route can contribute to both:
 * meta: {
 *   HeaderActions: ProjectActions,        // → useZones<AppZones>()
 *   headerVariant: "project" as const,    // → useRouteData<AppRouteData>()
 * }
 *
 * // Layout reads each channel with its own typing:
 * const zones = useZones<AppZones>()
 * const routeData = useRouteData<AppRouteData>()
 * // routeData.value.headerVariant, routeData.value.pageTitle
 * ```
 *
 * ## Merge semantics
 *
 * Walks matched records root-to-leaf, deepest match wins per key.
 * `undefined` values at a deeper level don't override an ancestor —
 * **omit the key (or set it to `undefined`) to inherit**. Set the key
 * to `null` to **explicitly clear** an ancestor's value; the consuming
 * shell decides how to render `null` (typically: as if the field was
 * never set, but distinct from "still loading").
 *
 * In dev (NODE_ENV !== "production"), this composable logs a deduped
 * `console.warn` whenever a deeper match overrides a key already set by
 * an ancestor. The warning is intended to catch accidental clobbers of
 * shell-owned route data (e.g. `headerVariant`); ignore it when the
 * override is intentional.
 *
 * ## Returned object contains all meta keys, not just declared ones
 *
 * The merged value is the raw merged `meta` — TypeScript narrows what you
 * can *access* via `TRouteData`, but every key present across matches is
 * still there at runtime. If a route declared a component zone (e.g.
 * `HeaderActions`) on the same `meta` object, it appears here too.
 *
 * This is intentional: the two composables (`useZones` / `useRouteData`)
 * don't have to coordinate on key sets, so a migration can split meta fields
 * between them incrementally. The consequence is that code that iterates the
 * merged value (`Object.keys(useRouteData().value)`, `JSON.stringify`, etc.)
 * will see component entries mixed with data entries — read by declared key,
 * not by iteration.
 *
 * ## Return value
 *
 * Returns a `ComputedRef` driven by `useRoute()`, so the merged data
 * recomputes when navigation changes the matched hierarchy. Read
 * `routeData.value` in script, or let the template auto-unwrap it.
 */
const onOverride = createRouteDataOverrideWarner("@modular-vue/runtime", "useRouteData", "meta");

export function useRouteData<TRouteData extends object>(): ComputedRef<Partial<TRouteData>> {
  const route = useRoute();
  return computed(() =>
    mergeRouteStaticData<TRouteData>(route.matched, (match) => (match as { meta?: unknown }).meta, {
      onOverride,
    }),
  );
}
