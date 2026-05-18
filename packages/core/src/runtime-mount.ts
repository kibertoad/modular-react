import type { ComponentType, ReactNode } from "react";

/**
 * Generic seam for embedding an external runtime as a child of another
 * runtime's rendering surface. Implementers wrap a runtime (journeys,
 * compositions, a federated remote, …); consumers (today: the
 * compositions outlet for `kind: "journey"` zones) call `start` to mint
 * an instance and render `Outlet` to mount it.
 *
 * The interface is intentionally minimal. The host owns its own
 * lifecycle (subscription, caching, error boundaries); the adapter only
 * needs to expose "give me an instance id from this definition id +
 * input" and "render the running instance".
 *
 * Lives in `@modular-react/core` so cross-plugin integration points
 * (compositions ↔ journeys; future compositions ↔ remote modules; future
 * composition-in-composition) share one shape without one plugin
 * package taking a hard dependency on another.
 */
export interface RuntimeMountAdapter<TInput = unknown> {
  /**
   * Mint (or resume) an instance for the named definition. The returned
   * id is opaque to the caller — the host treats it as a string token to
   * pass back to `Outlet`. Implementations forward to the underlying
   * runtime's `start()`.
   */
  start(definitionId: string, input: TInput): string;

  /**
   * React component that mounts a running instance by id. The optional
   * `loadingFallback` propagates through `Suspense` boundaries inside
   * the embedded runtime (e.g. while a lazy step chunk loads).
   */
  Outlet: ComponentType<{
    instanceId: string;
    loadingFallback?: ReactNode;
  }>;

  /**
   * Optional teardown for an instance the host minted via `start`. The
   * host calls this when it evicts an instance from its own cache (e.g.
   * a composition's per-zone journey cache rolling over to a new
   * resolution) so the embedded runtime can release its record. A
   * missing `end` is treated as a no-op — the embedded runtime is then
   * responsible for cleaning up by its own rules (typically, when its
   * outlet unmounts).
   */
  end?(instanceId: string): void;
}
