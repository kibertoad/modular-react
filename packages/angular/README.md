# @modular-angular/angular

Angular bindings for [`@modular-frontend/core`](../frontend-core): store and
reactive-service signal bridges, scoped stores, and injection-token contexts for
modules, navigation, and slots. This is the Angular analog of
[`@modular-react/react`](../react) and [`@modular-vue/vue`](../vue), and the
first package of the
[Angular support initiative](../../docs/angular-support-tracker.md) (PR-A10).

> Status: `0.x`, pre-1.0. The API tracks the React and Vue bindings
> case-for-case and will stay 0.x until the parity audit (PR-A42).

This package is plain TypeScript on the repo's rolldown pipeline — it carries no
`@Component` code (AD3). Components (the error-capture host, module-route host,
and the journey/composition outlets) land in `@modular-angular/components` and
later PRs.

## What's here (PR-A10 scope: store bridge and DI)

- **Signal bridges** — `storeSignal(store, selector?)` and
  `reactiveServiceSignal(rs, selector?)` bridge a framework-neutral `Store<T>` /
  `ReactiveService<T>` into a read-only Angular `Signal`, the analogs of React's
  `useSyncExternalStore` and Vue's `storeRef`.
- **Shared-dependency injectors** — `createSharedInjectors<TDeps>()` returns
  `injectStore`, `injectService`, `injectReactiveService`, and `injectOptional`,
  the Angular analogs of the React binding's `createSharedHooks` and the Vue
  binding's `createSharedComposables`. Reactive accessors return a `Signal`;
  plain services return the value directly.
- **Scoped stores** — `createScopedStore(initializer)` with an `injectScoped`
  accessor, for per-entity state.
- **Contexts** — typed `InjectionToken`s plus `provide*` provider factories and
  `inject*` accessors for the modules list (`injectModules`, `getModuleMeta`),
  the navigation manifest (`injectNavigation`), and slot contributions
  (`injectSlots`, `injectRecalculateSlots`, `provideDynamicSlots`,
  `createSlotsSignal`).

The runtime providers that install these contexts (`provideModularApp`) land
with the `@angular-router-modules` family.

## Injection-context rules

Every `inject*` accessor and both signal bridges must run inside an injection
context — a constructor, a field initializer, or a `runInInjectionContext`
callback — exactly like Angular's own `inject()`. Outside one they throw the
NG0203-style error (`assertInInjectionContext`). For calls from an event handler
or async callback, pass the `{ injector }` escape hatch present on every
accessor:

```ts
const user = injectStore("auth", (s) => s.user, { injector: this.injector });
```

Signal bridges tear their store subscription down via `DestroyRef.onDestroy`
when the owning injector is destroyed, so there is no listener leak. Suites run
zoneless (AD9); no `zone.js`.

## Store bridge

`storeSignal` seeds a `signal()` with the current snapshot and pushes new
snapshots from the store's `subscribe` callback. A selector is layered as a
`computed()`, whose `Object.is` output equality gives selector equality:
re-selecting the same value from an unrelated update does not wake dependents.

## Example

```ts
// In @myorg/app-shared:
import { createSharedInjectors } from "@modular-angular/angular";
import type { AppDependencies } from "@myorg/app-shared";

export const { injectStore, injectService, injectReactiveService, injectOptional } =
  createSharedInjectors<AppDependencies>();
```

```ts
// In any standalone component:
import { Component } from "@angular/core";
import { injectStore, injectService } from "@myorg/app-shared";

@Component({
  selector: "app-profile",
  template: `<p>Signed in as {{ user() }}</p>`,
})
export class ProfileComponent {
  readonly user = injectStore("auth", (s) => s.user); // Signal → reactive
  readonly api = injectService("httpClient"); // plain service → static
}
```
