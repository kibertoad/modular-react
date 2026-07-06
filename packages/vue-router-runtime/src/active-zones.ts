import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { useModules } from "@modular-vue/vue";
import type { ZoneMapOf } from "@modular-vue/core";
import { useZones } from "./zones.js";

/**
 * Read zone components from both the matched route hierarchy AND the
 * currently active module (identified by `activeModuleId`).
 *
 * This unifies two zone contribution patterns:
 * - **Route-based modules** contribute zones via vue-router's `meta`
 * - **Tab-based modules** contribute zones via the `zones` field on their descriptor
 *
 * When both sources provide a value for the same zone key, the module's
 * contribution wins.
 *
 * `activeModuleId` accepts a plain value, a ref, or a getter: pass a ref or
 * getter when the active module changes over the shell's lifetime (e.g. a tab
 * switcher) so the merged map recomputes. Returns a `ComputedRef` for the same
 * reason `useZones` does — the matched route hierarchy is reactive.
 */
export function useActiveZones<TZones extends ZoneMapOf<TZones>>(
  activeModuleId?: MaybeRefOrGetter<string | null | undefined>,
): ComputedRef<Partial<TZones>> {
  const routeZones = useZones<TZones>();
  const modules = useModules();

  return computed(() => {
    const id = toValue(activeModuleId);
    if (!id) {
      return routeZones.value;
    }

    const activeMod = modules.find((m) => m.id === id);
    if (!activeMod?.zones) {
      return routeZones.value;
    }

    // Module zones override route zones for the same key
    return { ...routeZones.value, ...activeMod.zones } as Partial<TZones>;
  });
}
