/**
 * The closed set of integration kinds the chooser can emit. Adding a value
 * here is the single edit point — the journey's `selectModuleOrDefault`
 * call narrows on this union, so a new kind that lacks a specific module
 * automatically funnels through the generic fallback.
 *
 * If we were to write a dedicated module for *every* integration, we'd
 * switch the journey to `selectModule` (exhaustive) instead — adding to
 * `IntegrationKind` would then require a matching cases entry, surfacing
 * the gap as a compile error.
 */
export type IntegrationKind = "github" | "strapi" | "contentful" | "notion";

/**
 * One row the chooser screen displays. Modules contribute their own row
 * to the `integrations` slot at registration time so the chooser doesn't
 * import or know about any specific integration — it just renders the
 * merged list.
 */
export interface IntegrationOption {
  readonly id: IntegrationKind;
  readonly label: string;
  readonly description: string;
}

/**
 * Slot map for this app — only one slot here. The framework concatenates
 * contributions from every registered module (and headless slot-only
 * modules) into a single readonly array on `useSlots()`.
 */
export interface AppSlots {
  readonly integrations: readonly IntegrationOption[];
}

/**
 * Minimal shared dependency surface for this example. Nothing actually
 * uses `tenantId` at runtime — it's there to demonstrate the typed
 * dependency channel modules can `requires`/consume in a real app.
 */
export interface AppDependencies {
  readonly tenantId: string;
}
