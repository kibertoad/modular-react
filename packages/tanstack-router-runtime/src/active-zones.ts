import type { ZoneMapOf } from "@tanstack-react-modules/core";
import { useModules } from "@modular-react/react";
import { useZones } from "./zones.js";

/**
 * Read zone components from both the matched route hierarchy AND the
 * currently active module (identified by `activeModuleId`).
 *
 * This unifies two zone contribution patterns:
 * - **Route-based modules** contribute zones via TanStack Router's `staticData`
 * - **Tab-based modules** contribute zones via the `zones` field on their descriptor
 *
 * When both sources provide a value for the same zone key, the module's
 * contribution wins.
 */
export function useActiveZones<TZones extends ZoneMapOf<TZones>>(
  activeModuleId?: string | null,
): Partial<TZones> {
  const routeZones = useZones<TZones>();
  const modules = useModules();

  if (!activeModuleId) {
    return routeZones;
  }

  const activeMod = modules.find((m) => m.id === activeModuleId);
  if (!activeMod?.zones) {
    return routeZones;
  }

  // Module zones override route zones for the same key
  return { ...routeZones, ...activeMod.zones } as Partial<TZones>;
}
