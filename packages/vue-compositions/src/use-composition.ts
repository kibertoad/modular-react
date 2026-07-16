import { onScopeDispose } from "vue";
import type {
  CompositionHandleRef,
  CompositionInstanceId,
  CompositionRuntime,
} from "@modular-frontend/compositions-engine";

import { useCompositionsContext } from "./provider.js";

/**
 * Brand symbol on {@link UseCompositionOptions} so the {@link useComposition}
 * overload resolver can disambiguate it from an `input` of shape
 * `{ runtime: … }` without relying on key-counting (which would break the
 * moment options gained a second field). Always set via
 * `useCompositionOptions(...)`. Ported verbatim from the React binding.
 */
const USE_COMPOSITION_OPTIONS_BRAND: unique symbol = Symbol.for(
  "@modular-vue/compositions/useCompositionOptions",
);

export interface UseCompositionOptions {
  /**
   * Runtime to mint the instance against. Optional when a
   * `<CompositionsProvider>` is mounted above — the composable reads the
   * runtime from context in that case (parallel to `<CompositionOutlet>`).
   */
  readonly runtime?: CompositionRuntime;
}

/**
 * Wrap a {@link UseCompositionOptions} object so {@link useComposition} can
 * detect it positionally even when `TInput` happens to have a `runtime` field.
 * Pass the result as the last argument:
 *
 * ```ts
 * useComposition(handle, input, useCompositionOptions({ runtime }));
 * ```
 *
 * Branding is the only safe disambiguation when `TInput` is `unknown` — a
 * key-shape sniff misclassifies any input object whose only key is `runtime`.
 */
export function useCompositionOptions(
  options: UseCompositionOptions,
): UseCompositionOptions & { readonly [USE_COMPOSITION_OPTIONS_BRAND]: true } {
  return Object.assign({}, options, {
    [USE_COMPOSITION_OPTIONS_BRAND]: true as const,
  });
}

function isBrandedOptions(value: unknown): value is UseCompositionOptions {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[USE_COMPOSITION_OPTIONS_BRAND] === true
  );
}

/**
 * Mint a composition instance once for the lifetime of the calling component,
 * returning its id. Use the returned id to drive
 * `<CompositionOutlet :instance-id="id">` (PR-34) in the same render path. The
 * Vue analog of the React `useComposition` hook.
 *
 * Disposal is handled automatically. This composable registers a no-op
 * subscription against the minted instance and tears it down on scope dispose
 * (component unmount): the runtime's disposal gate fires when the last outlet
 * and the last subscriber both go away, so a host that holds an id *without*
 * mounting an outlet (or that conditionally renders one) still gets its
 * instance cleaned up rather than orphaning it. A still-mounted sibling outlet
 * keeps the instance alive (the gate checks `outletRefCount === 0 &&
 * listeners.size === 0`). Hosts that need imperative teardown earlier (a Cmd-K
 * palette closing a stale instance, an "abort" button) can call
 * `runtime.end(id)` directly.
 *
 * **The bound instance is fixed at mount.** Vue's `setup` runs once, so — like
 * the React hook, which fixes the binding at first render — this composable
 * does not react to subsequent changes to `handle`, `input`, or
 * `options.runtime`; it returns the originally-minted id for the lifetime of
 * the component. To re-mint with different arguments, change the component's
 * `key` so Vue unmounts and remounts it.
 */
export function useComposition<TId extends string, TInput>(
  handle: CompositionHandleRef<TId, TInput>,
  ...rest: [TInput] extends [void]
    ? [options?: UseCompositionOptions]
    : [input: TInput, options?: UseCompositionOptions]
): CompositionInstanceId;
export function useComposition(
  compositionId: string,
  input: unknown,
  options?: UseCompositionOptions,
): CompositionInstanceId;
export function useComposition(
  handleOrId: CompositionHandleRef<string, unknown> | string,
  ...rest: unknown[]
): CompositionInstanceId {
  // Disambiguate the overloads positionally with a symbol brand on `options`,
  // mirroring the React binding: the brand is the only signal we trust when
  // `TInput` may itself carry a `runtime` field.
  let input: unknown = undefined;
  let options: UseCompositionOptions | undefined;
  if (rest.length > 0) {
    const last = rest[rest.length - 1];
    if (isBrandedOptions(last)) {
      options = last;
      if (rest.length > 1) input = rest[0];
    } else {
      input = last;
    }
  }

  const context = useCompositionsContext();
  const runtime = options?.runtime ?? context?.runtime;
  if (!runtime) {
    throw new Error(
      "[@modular-vue/compositions] useComposition() needs a runtime. Pass `options.runtime` (via `useCompositionOptions(...)`) or mount a <CompositionsProvider>.",
    );
  }

  // Mint once — `setup` runs a single time per mounted component, so no
  // lazy-ref guard is needed (the React hook's `useRef` dance defends against
  // StrictMode's double-invoke, which has no Vue equivalent).
  const instanceId = runtime.start(handleOrId as never, input as never);

  // Keep the instance alive for the lifetime of the calling component via a
  // no-op subscription. `runtime.subscribe` increments the listener count; the
  // returned unsubscribe runs the same microtask-deferred disposal gate as the
  // outlet's detach, so when the last outlet and the last subscriber both go
  // away the instance is cleaned up.
  const unsubscribe = runtime.subscribe(instanceId, () => {});
  onScopeDispose(unsubscribe);

  return instanceId;
}
