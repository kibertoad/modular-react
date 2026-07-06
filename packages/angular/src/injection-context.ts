import {
  assertInInjectionContext,
  inject,
  type Injector,
  type ProviderToken,
  runInInjectionContext,
} from "@angular/core";

/**
 * Escape hatch present on every `inject*` accessor and signal bridge in this
 * package. Angular's `inject()` only works inside a constructor, a field
 * initializer, or a `runInInjectionContext` callback; callers coming from
 * React hooks / Vue composables will otherwise hit NG0203-style errors. Passing
 * an explicit `injector` lets an accessor run outside those places (an event
 * handler, an async callback), mirroring how the runtime documents the rule.
 *
 * Prefer to call an accessor once per injector — a field initializer. The
 * reactive bridges (`injectStore`/`injectReactiveService`/`injectOptional`/
 * scoped stores) open a subscription that is released only when the owning
 * injector is destroyed, so calling an accessor repeatedly (inside an event
 * handler or a loop) via `{ injector }` accumulates one live subscription per
 * call. Capture the signal once and read it, rather than re-injecting.
 */
export interface InjectionContextOptions {
  /** Injector to run in when the caller is outside an ambient injection context. */
  injector?: Injector;
}

/**
 * Inject a required context token or throw a uniform "within a modular app"
 * error. Uses `{ optional: true }` so a missing provider surfaces the given
 * package-prefixed message instead of a raw NG0201. Shared by the `inject*`
 * context accessors (modules, navigation, slots, shared dependencies) so the
 * null-check and error prefix live in one place.
 */
export function injectRequired<T>(token: ProviderToken<T>, message: string): T {
  const value = inject(token, { optional: true });
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

/**
 * Run `fn` in an injection context: either the ambient one (constructor / field
 * initializer) or the one carried by `options.injector`. When neither is
 * present, `assertInInjectionContext` throws the NG0203-style error naming
 * `debugFn`, giving a clear failure instead of a raw `inject()` throw.
 */
export function runInContext<T>(
  options: InjectionContextOptions | undefined,
  // Only read for its `.name` by `assertInInjectionContext`; the overloaded
  // accessors passed here are not callable through this parameter's type.
  debugFn: (...args: any[]) => unknown,
  fn: () => T,
): T {
  const injector = options?.injector;
  if (injector) {
    return runInInjectionContext(injector, fn);
  }
  assertInInjectionContext(debugFn);
  return fn();
}

/**
 * Split the overloaded `(selector?, options?)` / `(options?)` trailing arguments
 * shared by the reactive accessors into a normalized `{ selector, options }`.
 */
export function splitSelectorOptions<T>(
  selectorOrOptions?: ((state: T) => unknown) | InjectionContextOptions,
  maybeOptions?: InjectionContextOptions,
): { selector?: (state: T) => unknown; options?: InjectionContextOptions } {
  if (typeof selectorOrOptions === "function") {
    return { selector: selectorOrOptions, options: maybeOptions };
  }
  return { options: selectorOrOptions };
}
