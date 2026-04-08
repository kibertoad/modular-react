import type { ZoneMapOf } from "@react-router-modules/core";
import { useZones } from "./zones.js";
import { useModules } from "./modules-context.js";

/**
 * Read zone components from both the matched route hierarchy AND the
 * currently active module (identified by `activeModuleId`).
 *
 * This unifies two zone contribution patterns:
 * - **Route-based modules** contribute zones via React Router's `handle`
 * - **Tab-based modules** contribute zones via the `zones` field on their descriptor
 *
 * When both sources provide a value for the same zone key, the module's
 * contribution wins — the assumption is that the active tab's content is more
 * relevant than the underlying route's.
 *
 * @param activeModuleId - The id of the module that is currently active in the
 *   workspace (e.g. the journey tab's moduleId). Pass `null` or `undefined`
 *   when no module tab is active — only route zones are returned.
 *
 * @example
 * // In the shell layout:
 * const activeTab = getActiveTab(interactionId)
 * const moduleId = activeTab?.type === 'native-journey' ? activeTab.journeyId : null
 * const zones = useActiveZones<AppZones>(moduleId)
 * const Panel = zones.contextualPanel
 *
 * return (
 *   <aside>{Panel ? <Panel /> : <DefaultPanel />}</aside>
 * )
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
