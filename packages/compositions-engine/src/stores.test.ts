import { afterEach, describe, expect, it } from "vitest";
import { defineEntry, defineModule, schema } from "@modular-frontend/core";
import type { ReadableStore, WritableStore } from "@modular-frontend/core";
import type { ModuleEntryProps } from "@modular-frontend/core";

import { createCompositionRuntime } from "./runtime.js";
import { defineComposition } from "./define-composition.js";
import { createCompositionZoneStores } from "./stores.js";
import type { RegisteredComposition } from "./types.js";

/**
 * Coverage for the typed store-contract primitive
 * ({@link createCompositionZoneStores}) — verifies the three behaviours panels
 * depend on:
 *
 *   1. **Identity stability**: same `(instance, key)` → same store
 *      reference across selector re-runs. `useSyncExternalStore` needs
 *      this to avoid re-subscribing on every render.
 *   2. **Slice subscription**: listeners fire only when the projected
 *      slice value changes — not on every composition state mutation.
 *   3. **Round-trip through dispatch**: `writable.set(...)` drives
 *      composition state via the runtime; subscribers see the update.
 */

interface FixtureState {
  readonly counter: number;
  readonly label: string;
}

function noopPanel(_: ModuleEntryProps<unknown>) {
  return null;
}
const panelModule = defineModule({
  id: "panel",
  version: "1.0.0",
  entryPoints: { main: defineEntry({ component: noopPanel, input: schema<unknown>() }) },
});
type Modules = { readonly panel: typeof panelModule };

function makeRuntime() {
  const composition = defineComposition<Modules, FixtureState>()({
    id: "fixture",
    version: "1.0.0",
    initialState: () => ({ counter: 0, label: "init" }),
    zones: {
      main: {
        select: () => ({ kind: "module-entry", module: "panel", entry: "main", input: undefined }),
      },
    },
  });
  const runtime = createCompositionRuntime(
    [{ definition: composition, options: undefined } satisfies RegisteredComposition],
    { modules: { panel: panelModule } },
  );
  const instanceId = runtime.start(composition.id, undefined);
  return { runtime, instanceId };
}

describe("createCompositionZoneStores", () => {
  let cleanup: Array<() => void> = [];
  afterEach(() => {
    for (const fn of cleanup.splice(0)) fn();
  });

  it("returns the same store reference for repeated calls with the same key", () => {
    const { runtime, instanceId } = makeRuntime();
    const stores = createCompositionZoneStores<FixtureState>(runtime, instanceId);

    const a = stores.readable("counter", (s) => s.counter);
    const b = stores.readable("counter", (s) => s.counter);
    expect(a).toBe(b);

    // Writable upgrades the entry under the same key — repeat writable
    // calls return the same writable.
    const w1 = stores.writable("counter", {
      get: (s) => s.counter,
      set: (v) => ({ counter: v }),
    });
    const w2 = stores.writable("counter", {
      get: (s) => s.counter,
      set: (v) => ({ counter: v }),
    });
    expect(w1).toBe(w2);
  });

  it("getSnapshot reads the current composition state", () => {
    const { runtime, instanceId } = makeRuntime();
    const stores = createCompositionZoneStores<FixtureState>(runtime, instanceId);
    const store: ReadableStore<number> = stores.readable("counter", (s) => s.counter);

    expect(store.getSnapshot()).toBe(0);
    runtime.dispatch(instanceId, { counter: 7 });
    expect(store.getSnapshot()).toBe(7);
  });

  it("subscribe fires only on slice-level changes, not on unrelated state updates", () => {
    const { runtime, instanceId } = makeRuntime();
    const stores = createCompositionZoneStores<FixtureState>(runtime, instanceId);
    const counterStore = stores.readable("counter", (s) => s.counter);

    let fires = 0;
    cleanup.push(counterStore.subscribe(() => fires++));

    // Mutation that doesn't touch `counter` — listener stays silent.
    runtime.dispatch(instanceId, { label: "renamed" });
    expect(fires).toBe(0);

    // Mutation that changes `counter` — listener fires once.
    runtime.dispatch(instanceId, { counter: 1 });
    expect(fires).toBe(1);

    // Dispatch with the same `counter` value — listener stays silent.
    runtime.dispatch(instanceId, { counter: 1 });
    expect(fires).toBe(1);

    // Next change → one more fire.
    runtime.dispatch(instanceId, { counter: 2 });
    expect(fires).toBe(2);
  });

  it("writable.set drives composition state via runtime.dispatch", () => {
    const { runtime, instanceId } = makeRuntime();
    const stores = createCompositionZoneStores<FixtureState>(runtime, instanceId);
    const store: WritableStore<number> = stores.writable("counter", {
      get: (s) => s.counter,
      set: (value) => ({ counter: value }),
    });

    let fires = 0;
    cleanup.push(store.subscribe(() => fires++));

    store.set(42);

    expect(runtime.getInstance(instanceId)?.state).toMatchObject({ counter: 42 });
    expect(store.getSnapshot()).toBe(42);
    expect(fires).toBe(1);
  });

  it("multiple subscribers all fire on a slice change; unsubscribing removes one only", () => {
    const { runtime, instanceId } = makeRuntime();
    const stores = createCompositionZoneStores<FixtureState>(runtime, instanceId);
    const store = stores.readable("counter", (s) => s.counter);

    let firesA = 0;
    let firesB = 0;
    const unsubA = store.subscribe(() => firesA++);
    cleanup.push(store.subscribe(() => firesB++));

    runtime.dispatch(instanceId, { counter: 1 });
    expect(firesA).toBe(1);
    expect(firesB).toBe(1);

    unsubA();
    runtime.dispatch(instanceId, { counter: 2 });
    expect(firesA).toBe(1);
    expect(firesB).toBe(2);
  });
});
