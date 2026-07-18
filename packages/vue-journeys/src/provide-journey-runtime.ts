import type { App } from "vue";
import type { ModuleExitEvent } from "@modular-vue/vue";

import type { JourneyRuntime } from "@modular-frontend/journeys-engine";
import { journeyKey, type JourneyProviderValue } from "./provider.js";

export interface ProvideJourneyRuntimeOptions {
  /**
   * Shell-wide fallback dispatcher for module exits fired outside a journey
   * step — the app-level equivalent of `<JourneyProvider :onModuleExit>`.
   */
  readonly onModuleExit?: (event: ModuleExitEvent) => void;
}

/**
 * App-level twin of `<JourneyProvider>`: install the journey runtime on a Vue
 * `App` via `app.provide` so `<JourneyOutlet>` and the instance composables
 * resolve it from context without a wrapping component in the render tree. The
 * journeys analog of `@modular-vue/vue`'s `provideNavigation` / `provideSlots`
 * standalone helpers.
 *
 * **You usually do not need to call this.** When the registry is built with
 * `journeysPlugin()`, the plugin's `appProvides` hook already threads the
 * runtime app-wide through `app.use(manifest)` (the router-owning `resolve()` /
 * `installModularApp` path) — `<JourneyOutlet>` resolves `journeyKey` with no
 * shell wiring. This helper is the explicit escape hatch for the cases that
 * bypass that:
 *
 *   - a shell that constructs a `JourneyRuntime` by hand (no `journeysPlugin()`),
 *   - installing the same runtime on a second app (SSR, multiple roots),
 *   - overriding the app-wide runtime for a subtree that mounts its own app.
 *
 * ```ts
 * // Hand-wired runtime, no plugin:
 * const runtime = createJourneyRuntime(registered, { modules });
 * provideJourneyRuntime(app, runtime, { onModuleExit: (e) => reportExit(e) });
 * ```
 *
 * A local `<JourneyProvider :runtime>` mounted lower in the tree still wins for
 * its subtree (component-level `inject` shadows the app-level provide), so this
 * only supplies the default when no nearer provider is present.
 */
export function provideJourneyRuntime(
  app: App,
  runtime: JourneyRuntime,
  options?: ProvideJourneyRuntimeOptions,
): void {
  const value: JourneyProviderValue = {
    runtime,
    onModuleExit: options?.onModuleExit,
  };
  app.provide(journeyKey, value);
}
