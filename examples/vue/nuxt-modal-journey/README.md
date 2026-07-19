# Nuxt modal-mounted journey (Pinia persistence)

A **real Nuxt 4 app** (`ssr: false`) that hosts a journey inside a **modal with
no URL**, backed by **Pinia persistence**, with the journey runtime threaded
**app-wide automatically** — no `<JourneyProvider>` anywhere. This is the shape
the `@modular-vue/nuxt` framework-mode guide describes, and the closest analog
to a single-route board app adopting journeys for its wizards.

It exercises three things the unit/integration tests cover but no other example
demonstrates end-to-end:

1. **Router-owning install + `appProvides`.** `installModularApp` (from a
   hand-written client plugin — Option B) calls `resolve()`, grafts routes onto
   Nuxt's router, and `app.use(manifest)`. Because the registry carries
   `journeysPlugin()`, that install also threads the journey runtime app-wide
   under `journeyKey` via the plugin's `appProvides` hook. The modal's
   `<JourneyOutlet>` and the page's `useJourneyContext()` resolve the runtime
   from context with **no** `<JourneyProvider>` wrapper.
2. **Pinia-backed persistence.** `createPiniaJourneyPersistence` stores in-flight
   journeys in a Pinia store (`stores/journeys.ts`), keyed by `frameId`. The
   store is mirrored to `localStorage` (a tiny dependency-free stand-in for
   pinia-plugin-persistedstate) so a full reload recovers the journey.
3. **Modal hosting that survives close.** `<JourneyHost>` owns an instance's
   lifetime and **ends it on unmount** — right for a route/tab host, wrong for a
   modal that must survive close. So the modal instead starts the instance
   itself (`runtime.start`, idempotent under persistence) and renders a plain
   `<JourneyOutlet>`; a small always-mounted `JourneyKeepAlive` holds a
   subscription so the outlet's abandon-on-unmount is skipped
   (`record.listeners.size > 0`). Closing the modal keeps the journey; reopening
   resumes it.
4. **Close vs. cancel.** Two buttons make the contract concrete. **Close**
   (`ui.close()`) is a soft close — it only hides the modal, the keep-alive holds
   the instance, and the blob survives for resume. **Cancel**
   (`runtime.discard(id)`, in `useWizardControls`) is a hard cancel — it ends the
   instance and removes the persisted blob in one call, so reopening starts
   fresh. Only a genuine complete (confirm) or a discard removes the blob.

## Layout

```
app-shared/            shared domain types
modules/wizard/        one module, two entries (choosePlan → confirm)
journeys/setup-wizard/ the journey definition + handle
shell/                 the Nuxt app
  plugins/modular.client.ts        builds the registry + installModularApp (appProvides)
  plugins/pinia-persist.client.ts  mirrors the journeys store to localStorage
  composables/useWizardControls.ts opens the modal via useJourneyContext().runtime.start
  components/SetupWizardModal.vue   <JourneyOutlet> in a v-if modal (no URL)
  components/JourneyKeepAlive.vue    keeps the instance alive across close
  stores/{ui,journeys}.ts           Pinia: modal state + persistence backing store
  pages/index.vue                    single route; buttons open the wizard
```

## Run

```bash
pnpm --filter @example-vue-nuxt-modal/shell dev       # nuxi dev
pnpm --filter @example-vue-nuxt-modal/shell test:e2e  # Playwright smoke
```

The e2e (`shell/e2e/smoke.spec.ts`) drives the whole contract: open → advance →
persisted (save), close/reopen resume (in-session), reload/reopen resume
(persistence load), finish → blob removed, and per-frame instance isolation.

See [`docs/journeys-vue.md`](../../../docs/journeys-vue.md) §4 and §7 for the
patterns this example puts together.
