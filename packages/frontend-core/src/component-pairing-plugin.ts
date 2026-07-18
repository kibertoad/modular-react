import type { ModuleDescriptor } from "./types.js";
import type { RegistryPlugin } from "./plugin.js";
import {
  resolveComponentRegistry,
  type ComponentEntry,
  type OnDuplicateComponentId,
} from "./component-registry.js";

/**
 * A component id referenced by a statically-registered manifest, optionally
 * tagged with where it came from so a dangling-reference error can name the
 * source.
 */
export type ComponentRefSpec = string | { readonly id: string; readonly from?: string };

export interface ComponentPairingPluginOptions {
  /** The slot key holding the {@link ComponentEntry} array contributed by modules. */
  readonly componentSlot: string;
  /**
   * Extract the component ids referenced by statically-registered manifests/data
   * across the registered modules. Each returned ref is checked against the
   * component slot at resolve time; any that doesn't resolve fails the resolve.
   *
   * Return `{ id, from }` (rather than a bare string) when you want the error to
   * name which manifest/module made the dangling reference.
   */
  readonly staticRefs: (
    modules: readonly ModuleDescriptor<any, any, any, any>[],
  ) => readonly ComponentRefSpec[];
  /** Duplicate-id policy for the component slot itself. Defaults to `throw`. */
  readonly onDuplicate?: OnDuplicateComponentId;
}

/**
 * A registry plugin that validates, at resolve time, that every
 * **statically-registered** manifest reference resolves against a component slot
 * — a peer of the core duplicate-id / dependency validators. Opt in via
 * `registry.use(componentPairingPlugin({ ... }))`.
 *
 * Scope, deliberately thin: this is a **reference-integrity check only**. It adds
 * no module type, no runtime pairing, and no registry state — the paired registry
 * is built at render time by {@link resolveComponentRegistry} / {@link pairById}.
 *
 * It sees **static** slot contributions only (`module.slots`); `dynamicSlots`
 * factories and async remote manifests are not evaluated at validate time. Those
 * are covered at runtime by `pairById`'s `missing` bucket. Use this plugin to
 * catch build-time-known dangling references early; use `pairById` for everything
 * that arrives over the wire.
 */
export function componentPairingPlugin(
  options: ComponentPairingPluginOptions,
): RegistryPlugin<"componentPairing", object, void> {
  const { componentSlot, staticRefs, onDuplicate } = options;

  return {
    name: "componentPairing",
    extend: () => ({}),
    validate: (ctx) => {
      const entries: ComponentEntry<unknown>[] = [];
      for (const mod of ctx.modules) {
        const slotValue = (mod.slots as Record<string, unknown> | undefined)?.[componentSlot];
        if (Array.isArray(slotValue)) {
          entries.push(...(slotValue as ComponentEntry<unknown>[]));
        }
      }

      // Reuse the same duplicate-id validation as the runtime pairing path, so a
      // duplicate component id surfaces here at resolve time too.
      const registry = resolveComponentRegistry(entries, { onDuplicate });

      const dangling = staticRefs(ctx.modules)
        .map((ref) => (typeof ref === "string" ? { id: ref } : ref))
        .filter((ref) => !registry.has(ref.id));

      if (dangling.length > 0) {
        const list = dangling
          .map((ref) => (ref.from ? `"${ref.id}" (from ${ref.from})` : `"${ref.id}"`))
          .join(", ");
        throw new Error(
          `[@modular-frontend/core] componentPairingPlugin: manifest references component id(s) with no ` +
            `registered component in slot "${componentSlot}": ${list}. Register the component via a module ` +
            `slot contribution, or remove the reference.`,
        );
      }
    },
  };
}
