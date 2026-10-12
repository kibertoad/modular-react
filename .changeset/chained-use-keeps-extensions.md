---
"@tanstack-react-modules/runtime": patch
"@react-router-modules/runtime": patch
"@modular-vue/runtime": patch
"@modular-frontend/core": patch
---

`registry.use()` now keeps every earlier plugin's extension in the returned type, so `createRegistry().use(journeysPlugin()).use(compositionsPlugin())` exposes both `registerJourney` and `registerComposition` without a cast. This also holds when a plugin contributes no methods (such as `componentPairingPlugin`) and on registries whose plugin list is generic. `PluginExtensionsOf` no longer drops an extension that another plugin's extension is assignable to, and returns `object` instead of `any` for a non-tuple plugin array.
