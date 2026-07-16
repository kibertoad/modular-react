import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { ZoneMapOf } from "@modular-vue/core";
import { useModules } from "@modular-vue/vue";
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
 * Returns a `ComputedRef` that recomputes when the route changes or when
 * `activeModuleId` (a ref or getter) changes, so a tab-based shell re-renders
 * its zones as the active tab switches.
 *
 * @remarks
 * `activeModuleId` accepts a `MaybeRefOrGetter` — a plain string, a `Ref`, or
 * a getter — so a reactive "active tab" selection stays reactive through the
 * composable. The React source takes a plain `string | null`; the Vue port
 * relaxes it to preserve reactivity (a plain string still works).
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

    // Module zones override route zones for the same key.
    return { ...routeZones.value, ...activeMod.zones } as Partial<TZones>;
  });
}
