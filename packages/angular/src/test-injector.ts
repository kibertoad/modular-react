import {
  createEnvironmentInjector,
  EnvironmentInjector,
  provideZonelessChangeDetection,
  type Provider,
  runInInjectionContext,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";

export interface RenderedContext<T> {
  /** The accessor's return value, captured once at creation time. */
  result: T;
  /** The destroyable environment injector the accessor ran in. */
  injector: EnvironmentInjector;
  /** Destroy the injector, firing `DestroyRef.onDestroy` teardown. */
  destroy: () => void;
}

/**
 * Test-only helper (not part of the public build): the Angular analog of the
 * Vue port's `renderComposable` and React's `renderHook`. Runs an `inject*`
 * accessor (or `storeSignal`, …) inside a destroyable environment injector
 * seeded with `providers`, so subscribe-on-create / unsubscribe-on-destroy and
 * `DestroyRef` teardown can be asserted. Zoneless; no component is rendered.
 */
export function renderInContext<T>(fn: () => T, providers: Provider[] = []): RenderedContext<T> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const parent = TestBed.inject(EnvironmentInjector);
  const injector = createEnvironmentInjector(providers, parent);
  const result = runInInjectionContext(injector, fn);
  return { result, injector, destroy: () => injector.destroy() };
}
