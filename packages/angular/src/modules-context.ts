import { InjectionToken, type Provider } from "@angular/core";
import type { ModuleEntry } from "@modular-frontend/core";
import { type InjectionContextOptions, injectRequired, runInContext } from "./injection-context.js";

/** Injection token holding the list of registered modules. */
export const MODULES = new InjectionToken<readonly ModuleEntry[]>("modular-angular.modules");

/**
 * Provider factory that installs the registered modules. Analog of rendering
 * `<ModulesContext value={modules}>`.
 */
export function provideModules(modules: readonly ModuleEntry[]): Provider {
  return { provide: MODULES, useValue: modules };
}

/**
 * Access the list of registered modules with their metadata and components.
 * Must be used within a modular app (or given an explicit `{ injector }`).
 *
 * Use this to build discovery UIs (directory pages, search, catalogs) and to
 * render module components in workspace tabs or panels.
 *
 * @example
 * readonly modules = injectModules()
 * readonly journeys = this.modules.filter(m => m.meta?.category === 'payments')
 */
export function injectModules(options?: InjectionContextOptions): readonly ModuleEntry[] {
  return runInContext(options, injectModules, () =>
    injectRequired(
      MODULES,
      "[@modular-angular/angular] injectModules must be used within a modular app.",
    ),
  );
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
