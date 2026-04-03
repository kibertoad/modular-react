import { createContext, useContext } from "react";
import type { ModuleEntry } from "@modular-react/core";

export const ModulesContext = createContext<readonly ModuleEntry[] | null>(null);

/**
 * Access the list of registered modules with their metadata and components.
 * Must be used within a <ReactiveApp /> provider tree.
 *
 * Use this to build discovery UIs (directory pages, search, catalogs)
 * and to render module components in workspace tabs or panels.
 *
 * @example
 * const modules = useModules()
 * const journeys = modules.filter(m => m.meta?.category === 'payments')
 *
 * @example
 * const mod = modules.find(m => m.id === activeTab.moduleId)
 * if (mod?.component) return <mod.component {...props} />
 */
export function useModules(): readonly ModuleEntry[] {
  const modules = useContext(ModulesContext);
  if (!modules) {
    throw new Error(
      "[@modular-react/react] useModules must be used within a <ReactiveApp />.",
    );
  }
  return modules;
}

/**
 * Type-safe accessor for module metadata.
 * Use this when the shell defines a known meta shape and wants to read it
 * without casting every field.
 *
 * Returns undefined if the module has no meta.
 *
 * @example
 * interface JourneyMeta { name: string; category: string; icon: string }
 * const meta = getModuleMeta<JourneyMeta>(mod)
 * if (meta) console.log(meta.name) // typed, no cast
 */
export function getModuleMeta<TMeta extends { [K in keyof TMeta]: unknown }>(
  entry: ModuleEntry,
): Readonly<TMeta> | undefined {
  return entry.meta as Readonly<TMeta> | undefined;
}
