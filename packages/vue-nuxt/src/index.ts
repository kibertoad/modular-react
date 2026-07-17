// The Nuxt module (default export) — add "@modular-vue/nuxt" to nuxt.config.ts
// `modules` and it resolves to this.
export { default } from "./module.js";
export { buildModularPluginContents } from "./module.js";
export type { ModuleOptions } from "./module.js";

// Runtime installer — call from your own `defineNuxtPlugin` for full control
// (auth guards, provider plugins, slot filters, per-request registries). Prefer
// importing this from the `@modular-vue/nuxt/runtime` subpath in plugin code:
// the barrel's Nuxt-module default export pulls in `@nuxt/kit` (a build-time
// dependency), and the subpath keeps it out of the app's runtime bundle.
export { installModularApp } from "./install.js";
export type { NuxtAppLike, InstallModularAppOptions } from "./install.js";

// Re-export the runtime manifest/exit types so a shell can type the value
// `installModularApp` returns without importing @modular-vue/runtime directly.
export type { ApplicationManifest, ModuleExitEvent } from "@modular-vue/runtime";
