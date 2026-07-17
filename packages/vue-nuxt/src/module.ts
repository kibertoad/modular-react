import { addPluginTemplate, defineNuxtModule } from "@nuxt/kit";
import type { NuxtModule } from "@nuxt/schema";

/**
 * Options for the `@modular-vue/nuxt` Nuxt module, read from the `modularVue`
 * key in `nuxt.config.ts`:
 *
 * ```ts
 * export default defineNuxtConfig({
 *   modules: ["@modular-vue/nuxt"],
 *   modularVue: { registry: "~/modular/registry", parentRouteName: "app" },
 * });
 * ```
 */
export interface ModuleOptions {
  /**
   * Import path to a module that default-exports either the registry itself or
   * a factory `(nuxtApp) => registry`. A factory is preferred under SSR so a
   * fresh registry is built per request; a plain registry export is fine for a
   * client-only app.
   *
   * Resolved by Nuxt's builder, so a `~`/`@` alias or a bare package specifier
   * both work. Defaults to `~/modular/registry`.
   */
  registry: string;

  /**
   * Name of an already-registered parent route (a Nuxt page) to graft module
   * routes under. Forwarded to `installModularApp`'s `parentRouteName`. Omit to
   * add module routes at the top level.
   */
  parentRouteName?: string;
}

/**
 * Build the source of the runtime plugin the module injects. Kept pure (string
 * in, string out) so it is unit-testable without booting Nuxt: the returned
 * code imports the user registry, unwraps a factory export, and hands both to
 * `installModularApp` inside a `defineNuxtPlugin`, exposing the manifest as
 * `$modular`.
 *
 * The plugin imports `installModularApp` from the `@modular-vue/nuxt/runtime`
 * subpath (not the package barrel) so the app's runtime bundle never pulls in
 * `@nuxt/kit`, which the barrel's Nuxt-module default export depends on.
 *
 * `#app` and the registry path are resolved by Nuxt's builder when this
 * template is materialized inside a real app, so nothing here is evaluated at
 * package build/test time.
 */
export function buildModularPluginContents(options: ModuleOptions): string {
  const registryPath = JSON.stringify(options.registry);
  const parentRouteName =
    options.parentRouteName != null ? JSON.stringify(options.parentRouteName) : "undefined";

  return `import { defineNuxtPlugin } from "#app";
import { installModularApp } from "@modular-vue/nuxt/runtime";
import registryExport from ${registryPath};

export default defineNuxtPlugin((nuxtApp) => {
  const registry =
    typeof registryExport === "function" ? registryExport(nuxtApp) : registryExport;
  const manifest = installModularApp(nuxtApp, registry, {
    parentRouteName: ${parentRouteName},
  });
  return { provide: { modular: manifest } };
});
`;
}

/**
 * The `@modular-vue/nuxt` Nuxt module. Add it to `nuxt.config.ts`'s `modules`
 * array and point `modularVue.registry` at your registry export; the module
 * injects a runtime plugin that calls {@link installModularApp} so module
 * routes are grafted onto Nuxt's router and the modular contexts are installed
 * on the Nuxt Vue app.
 *
 * Only the serializable options (`registry`, `parentRouteName`) flow through
 * `nuxt.config.ts`. Apps that need the non-serializable options
 * (`authGuard`, `providers`, `slotFilter`, `onModuleExit`) write their own
 * `defineNuxtPlugin` and call {@link installModularApp} directly instead of
 * (or alongside) this module — see the package README.
 */
const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: "@modular-vue/nuxt",
    configKey: "modularVue",
    compatibility: { nuxt: ">=3.0.0" },
  },
  defaults: {
    registry: "~/modular/registry",
  },
  setup(options, nuxt) {
    // The package ships ESM/TS; transpile it so Nuxt's build handles the
    // `installModularApp` import from the injected plugin.
    nuxt.options.build.transpile.push("@modular-vue/nuxt");

    addPluginTemplate({
      filename: "modular-vue.plugin.mjs",
      getContents: () => buildModularPluginContents(options),
    });
  },
});

export default module;
