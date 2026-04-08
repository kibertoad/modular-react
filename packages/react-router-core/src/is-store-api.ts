import type { StoreApi } from "zustand";
import type { ReactiveService } from "./types.js";

/**
 * Duck-type check for zustand StoreApi instances.
 */
export function isStoreApi(value: unknown): value is StoreApi<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    "getState" in value &&
    "setState" in value &&
    "subscribe" in value
  );
}

/**
 * Duck-type check for ReactiveService instances.
 * Must have subscribe + getSnapshot but NOT setState (which would make it a StoreApi).
 */
export function isReactiveService(value: unknown): value is ReactiveService<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    "subscribe" in value &&
    "getSnapshot" in value &&
    !("setState" in value)
  );
}

/**
 * Separates a mixed deps object into stores, services, and reactive services.
 * Used by the testing package and internally by the registry.
 */
export function separateDeps(deps: Record<string, unknown>): {
  stores: Record<string, StoreApi<unknown>>;
  services: Record<string, unknown>;
  reactiveServices: Record<string, ReactiveService<unknown>>;
} {
  const stores: Record<string, StoreApi<unknown>> = {};
  const services: Record<string, unknown> = {};
  const reactiveServices: Record<string, ReactiveService<unknown>> = {};

  for (const [key, value] of Object.entries(deps)) {
    if (value === undefined) continue;
    if (isStoreApi(value)) {
      stores[key] = value;
    } else if (isReactiveService(value)) {
      reactiveServices[key] = value;
    } else {
      services[key] = value;
    }
  }

  return { stores, services, reactiveServices };
}
