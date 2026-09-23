---
"@tanstack-react-modules/runtime": patch
"@react-router-modules/runtime": patch
"@modular-vue/runtime": patch
---

`registry.use()` now keeps every earlier plugin's extension in the returned type, so `createRegistry().use(journeysPlugin()).use(compositionsPlugin())` exposes both `registerJourney` and `registerComposition` without a cast.
