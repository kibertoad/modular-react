import { describe, it, expectTypeOf } from "vitest";
import type { Store } from "./store.js";

/**
 * Zustand v5 StoreApi shape — copied here to verify assignability
 * without depending on zustand at test time.
 */
interface ZustandStoreApi<T> {
  getState: () => T;
  getInitialState: () => T;
  setState: (
    partial: T | Partial<T> | ((state: T) => T | Partial<T>),
    replace?: boolean | undefined,
  ) => void;
  subscribe: (listener: (state: T, previousState: T) => void) => () => void;
}

describe("Store<T> ↔ zustand StoreApi<T> type compatibility", () => {
  it("ZustandStoreApi<T> is assignable to Store<T>", () => {
    expectTypeOf<ZustandStoreApi<{ count: number }>>().toMatchTypeOf<Store<{ count: number }>>();
  });

  it("Store<T> is assignable to ZustandStoreApi<T>", () => {
    expectTypeOf<Store<{ count: number }>>().toMatchTypeOf<ZustandStoreApi<{ count: number }>>();
  });
});
