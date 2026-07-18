import type { InjectionKey } from "vue";

/**
 * A single app-level injection binding — an `InjectionKey` paired with the
 * value to `app.provide` under it.
 */
export interface AppProvide<T = unknown> {
  readonly key: InjectionKey<T>;
  readonly value: T;
}

/**
 * Optional, Vue-specific extension to the neutral `RegistryPlugin` contract:
 * app-level injection bindings a plugin contributes for the **router-owning
 * install path** (`@modular-vue/nuxt`'s `installModularApp`, or any
 * `app.use(manifest)` shell).
 *
 * ## Why this exists
 *
 * A plugin's neutral `providers()` hook returns *wrapping components*. Those
 * work in React (always) and in the Vue framework-mode component form
 * (`resolveManifest`), which mounts them around the app tree. But the Vue
 * router-owning form (`resolve()`) installs the modular contexts app-wide via
 * `app.provide` — the app root is the user's own `<router-view>` shell, so
 * there is no library-owned root to wrap. Wrapping components have no home
 * there, which historically left plugin context (notably the journeys runtime)
 * un-threaded in that path.
 *
 * `appProvides` closes that gap the same way the framework itself threads
 * `navigationKey` / `modulesKey` / `slotsKey`: as `app.provide` bindings. A
 * plugin supplies its own `InjectionKey` + value, so `@modular-vue/runtime`
 * applies them without importing the plugin's package — the layering that lets
 * runtime packages stay independent of plugins is preserved. It is the
 * install-mode twin of `providers()`.
 *
 * Framework-neutral core has no notion of app-level injection (React has no
 * `app.provide`), so this lives in `@modular-vue/vue` rather than on the neutral
 * `RegistryPlugin`. A plugin opts in by intersecting its returned object with
 * this interface.
 *
 * ```ts
 * // inside a Vue registry plugin's returned object:
 * appProvides({ runtime }) {
 *   return [{ key: myContextKey, value: { runtime } }];
 * },
 * ```
 */
export interface VueAppProvidingPlugin<TRuntime = unknown> {
  /**
   * Contribute app-level injection bindings for the install path. Called once
   * per plugin at assembly time with the plugin's resolved runtime (the same
   * value passed to `providers()` and stored on `manifest.extensions[name]`).
   */
  readonly appProvides?: (ctx: { readonly runtime: TRuntime }) => readonly AppProvide[];
}

/**
 * Build an {@link AppProvide} with the key and value checked against each other.
 * Prefer this over an object literal in a plugin's `appProvides` — the return
 * type of `appProvides` is `readonly AppProvide[]` (with the pairing erased to
 * `unknown`), so a bare `{ key, value }` literal would let a mismatched value
 * slip through. `provideBinding(key, value)` enforces `value: T` against the
 * key's `InjectionKey<T>` at the authoring site.
 *
 * ```ts
 * appProvides({ runtime }) {
 *   return [provideBinding(myContextKey, { runtime })];
 * }
 * ```
 */
export function provideBinding<T>(key: InjectionKey<T>, value: T): AppProvide<T> {
  return { key, value };
}
