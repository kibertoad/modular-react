import { inject, provide, type InjectionKey } from "vue";
import type { ModuleEntry } from "@modular-frontend/core";

/** Injection key holding the list of registered modules. */
export const modulesKey: InjectionKey<readonly ModuleEntry[]> = Symbol("modular-vue.modules");

/**
 * Provide the registered modules to descendant components. Analog of rendering
 * `<ModulesContext value={modules}>`.
 */
export function provideModules(modules: readonly ModuleEntry[]): void {
  provide(modulesKey, modules);
}

/**
 * Access the list of registered modules with their metadata and components.
 * Must be used within a modular app provider tree.
 *
 * Use this to build discovery UIs (directory pages, search, catalogs)
 * and to render module components in workspace tabs or panels.
 *
 * @example
 * const modules = useModules()
 * const journeys = modules.filter(m => m.meta?.category === 'payments')
 */
export function useModules(): readonly ModuleEntry[] {
  const modules = inject(modulesKey, null);
  if (!modules) {
    throw new Error("[@modular-vue/vue] useModules must be used within a modular app.");
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
