import { assertInInjectionContext, type Injector, runInInjectionContext } from "@angular/core";

/**
 * Escape hatch present on every `inject*` accessor and signal bridge in this
 * package. Angular's `inject()` only works inside a constructor, a field
 * initializer, or a `runInInjectionContext` callback; callers coming from
 * React hooks / Vue composables will otherwise hit NG0203-style errors. Passing
 * an explicit `injector` lets an accessor run outside those places (an event
 * handler, an async callback), mirroring how the runtime documents the rule.
 */
export interface InjectionContextOptions {
  /** Injector to run in when the caller is outside an ambient injection context. */
  injector?: Injector;
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
