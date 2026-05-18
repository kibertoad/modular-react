/**
 * Regression coverage for the runtime fixes shipped alongside the
 * compositions plugin's first review pass. Each test maps to a numbered
 * finding from that review.
 */

import { describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { defineComposition } from "./define-composition.js";
import {
  CompositionHydrationError,
  createCompositionRuntime,
  getInternals,
  hydrateComposition,
} from "./runtime.js";
import {
  createMemoryCompositionPersistence,
  defineCompositionPersistence,
} from "./persistence.js";
import type {
  CompositionInstanceId,
  CompositionRuntimeOptions,
  RegisteredComposition,
  SerializedComposition,
} from "./types.js";
import type { CompositionPersistence } from "./types.js";

// --- Fixture modules / composition ------------------------------------------

const editorModule = defineModule({
  id: "editor",
  version: "1.0.0",
  exitPoints: { saved: defineExit() },
  entryPoints: {
    main: defineEntry({
      component: (() => null) as never,
      input: schema<{ documentId: string }>(),
    }),
  },
});

type AppModules = {
  readonly editor: typeof editorModule;
};

interface EditorState {
  readonly documentId: string;
  readonly counter: number;
}

const editor = defineComposition<AppModules, EditorState>()({
  id: "editor",
  version: "1.0.0",
  initialState: (input: { documentId: string }) => ({
    documentId: input.documentId,
    counter: 0,
  }),
  zones: {
    editorMain: {
      select: ({ state }) => ({
        kind: "module-entry",
        module: "editor",
        entry: "main",
        input: { documentId: state.documentId },
      }),
    },
  },
});

function makeRuntime(
  reg: Partial<RegisteredComposition> = {},
  options: CompositionRuntimeOptions = {},
) {
  return createCompositionRuntime(
    [
      {
        definition: editor,
        options: undefined,
        ...reg,
      } as RegisteredComposition,
    ],
    { modules: { editor: editorModule }, debug: false, ...options },
  );
}

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

// ---------------------------------------------------------------------------
// #1 — Persistence remove race with successor instance
// ---------------------------------------------------------------------------

describe("persistence remove vs successor race", () => {
  it("does not remove a successor's blob when a deferred remove fires", async () => {
    // Slow async adapter: save resolves on `releaseSave()`.
    let releaseSave!: () => void;
    const savePending = new Promise<void>((res) => {
      releaseSave = res;
    });
    const backend = new Map<string, SerializedComposition<EditorState>>();
    const removeCalls: string[] = [];

    const persistence: CompositionPersistence<EditorState, { documentId: string }> =
      defineCompositionPersistence<{ documentId: string }, EditorState>({
        keyFor: ({ compositionId, input }) => `${compositionId}:${input.documentId}`,
        load: (key) => backend.get(key) ?? null,
        save: async (key, blob) => {
          await savePending;
          backend.set(key, blob);
        },
        remove: (key) => {
          removeCalls.push(key);
          backend.delete(key);
        },
      });

    const runtime = createCompositionRuntime(
      [{ definition: editor, options: { persistence } } as RegisteredComposition],
      { modules: { editor: editorModule }, debug: false },
    );

    // Start A; wait for the load probe to settle and a save to land.
    const a = runtime.start("editor", { documentId: "doc-1" });
    await flushMicrotasks();
    runtime.dispatch<EditorState>(a, { counter: 1 });
    // Save is now in flight (awaiting savePending).

    // End A. The remove is deferred because save is in flight.
    runtime.end(a);

    // Start B with the same input. B claims the keyIndex slot.
    const b = runtime.start("editor", { documentId: "doc-1" });
    expect(b).not.toBe(a);
    await flushMicrotasks();
    // B writes its initial blob.
    runtime.dispatch<EditorState>(b, { counter: 99 });

    // Release the A save so the deferred remove path fires.
    releaseSave();
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    // The pending remove must NOT have fired because B owns the slot.
    expect(removeCalls).toEqual([]);
    expect(backend.get("editor:doc-1")).toBeDefined();
    expect(backend.get("editor:doc-1")?.state.counter).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// #2 — hydrateComposition no longer routes through start()
// ---------------------------------------------------------------------------

describe("hydrateComposition", () => {
  it("hydrates a blob whose composition requires TInput in initialState", () => {
    // The editor composition's initialState would crash on undefined input.
    // The previous implementation called start(compositionId, undefined as never)
    // and crashed; the new path bypasses start() entirely.
    const runtime = makeRuntime();
    const blob: SerializedComposition<EditorState> = {
      definitionId: "editor",
      version: "1.0.0",
      instanceId: "ci_seed" as CompositionInstanceId,
      status: "active",
      state: { documentId: "doc-1", counter: 5 },
      startedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    };
    const id = hydrateComposition(runtime, "editor", blob);
    expect(id).toBe("ci_seed");
    expect(runtime.getInstance(id)?.state).toEqual({
      documentId: "doc-1",
      counter: 5,
    });
    expect(runtime.getInstance(id)?.startedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("rejects a blob with a different definitionId", () => {
    const runtime = makeRuntime();
    const blob = {
      definitionId: "other",
      version: "1.0.0",
      instanceId: "ci_seed",
      status: "active",
      state: { documentId: "doc-1", counter: 0 },
      startedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    } as SerializedComposition<EditorState>;
    expect(() => hydrateComposition(runtime, "editor", blob)).toThrow(
      CompositionHydrationError,
    );
  });

  it("refuses to clobber a live instanceId", () => {
    const runtime = makeRuntime();
    const blob: SerializedComposition<EditorState> = {
      definitionId: "editor",
      version: "1.0.0",
      instanceId: "ci_dup" as CompositionInstanceId,
      status: "active",
      state: { documentId: "doc-1", counter: 0 },
      startedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    hydrateComposition(runtime, "editor", blob);
    expect(() => hydrateComposition(runtime, "editor", blob)).toThrow(
      /already live/,
    );
  });
});

// ---------------------------------------------------------------------------
// #6 — Version mismatch + onHydrate migration
// ---------------------------------------------------------------------------

describe("version mismatch handling", () => {
  it("rejects a stale blob when no onHydrate is provided", async () => {
    const onError = vi.fn();
    const store = createMemoryCompositionPersistence<{ documentId: string }, EditorState>({
      keyFor: ({ compositionId, input }) => `${compositionId}:${input.documentId}`,
    });
    store.save("editor:doc-1", {
      definitionId: "editor",
      version: "0.9.0", // stale
      instanceId: "ci_old" as CompositionInstanceId,
      status: "active",
      state: { documentId: "doc-1", counter: 7 },
      startedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    const runtime = createCompositionRuntime(
      [
        {
          definition: editor,
          options: { persistence: store, onError },
        } as RegisteredComposition,
      ],
      { modules: { editor: editorModule }, debug: false },
    );
    const id = runtime.start("editor", { documentId: "doc-1" });
    await flushMicrotasks();
    await flushMicrotasks();
    // Falls back to fresh initialState — counter starts at 0.
    expect(runtime.getInstance(id)?.state.counter).toBe(0);
    // The error was surfaced via the onError hook.
    expect(onError).toHaveBeenCalledWith(
      expect.any(CompositionHydrationError),
      expect.objectContaining({ phase: "lifecycle" }),
    );
    // Stale blob was replaced by the cold-start save with the fresh state
    // under the active definition's version — no `0.9.0` blob remains.
    const remaining = store.load("editor:doc-1");
    expect(remaining?.version).toBe("1.0.0");
    expect(remaining?.state.counter).toBe(0);
  });

  it("applies an onHydrate migration when versions diverge", async () => {
    const definitionV2 = {
      ...editor,
      version: "2.0.0",
      onHydrate: (blob: SerializedComposition<unknown>) => ({
        ...blob,
        version: "2.0.0",
        state: { documentId: "doc-1", counter: 100 },
      }) as SerializedComposition<EditorState>,
    };
    const store = createMemoryCompositionPersistence<{ documentId: string }, EditorState>({
      keyFor: ({ compositionId, input }) => `${compositionId}:${input.documentId}`,
    });
    store.save("editor:doc-1", {
      definitionId: "editor",
      version: "1.0.0",
      instanceId: "ci_old" as CompositionInstanceId,
      status: "active",
      state: { documentId: "doc-1", counter: 7 },
      startedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    const runtime = createCompositionRuntime(
      [
        {
          definition: definitionV2,
          options: { persistence: store },
        } as RegisteredComposition,
      ],
      { modules: { editor: editorModule }, debug: false },
    );
    const id = runtime.start("editor", { documentId: "doc-1" });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(runtime.getInstance(id)?.state.counter).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// #11 — Dispatch queue during persistence load
// ---------------------------------------------------------------------------

describe("dispatch during loading", () => {
  it("buffers dispatches issued before persistence load completes and replays them", async () => {
    let resolveLoad!: (blob: SerializedComposition<EditorState> | null) => void;
    const loadPending = new Promise<SerializedComposition<EditorState> | null>((res) => {
      resolveLoad = res;
    });
    const persistence: CompositionPersistence<EditorState, { documentId: string }> = {
      keyFor: ({ compositionId, input }) => `${compositionId}:${input.documentId}`,
      load: () => loadPending,
      save: () => {
        /* noop */
      },
      remove: () => {
        /* noop */
      },
    };
    const runtime = createCompositionRuntime(
      [{ definition: editor, options: { persistence } } as RegisteredComposition],
      { modules: { editor: editorModule }, debug: false },
    );
    const id = runtime.start("editor", { documentId: "doc-1" });
    // Dispatch BEFORE load completes — would silently no-op before the fix.
    runtime.dispatch<EditorState>(id, { counter: 42 });
    runtime.dispatch<EditorState>(id, (s) => ({ counter: s.counter + 1 }));
    expect(runtime.getInstance(id)?.status).toBe("loading");

    resolveLoad(null);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(runtime.getInstance(id)?.status).toBe("active");
    expect(runtime.getInstance(id)?.state.counter).toBe(43);
  });
});

// ---------------------------------------------------------------------------
// #14 — Duplicate registration is a hard error
// ---------------------------------------------------------------------------

describe("duplicate registration", () => {
  it("throws when the same composition is registered twice via createCompositionRuntime", () => {
    expect(() =>
      createCompositionRuntime(
        [
          { definition: editor, options: undefined } as RegisteredComposition,
          { definition: editor, options: undefined } as RegisteredComposition,
        ],
        { modules: { editor: editorModule } },
      ),
    ).toThrow(/registered more than once/);
  });
});

// ---------------------------------------------------------------------------
// #15 — Loaded blob preserves its updatedAt across the store splice
// ---------------------------------------------------------------------------

describe("persistence-load preserves blob timestamps", () => {
  it("does not stamp updatedAt with `Date.now()` during the load splice", async () => {
    const store = createMemoryCompositionPersistence<{ documentId: string }, EditorState>({
      keyFor: ({ compositionId, input }) => `${compositionId}:${input.documentId}`,
    });
    store.save("editor:doc-1", {
      definitionId: "editor",
      version: "1.0.0",
      instanceId: "ci_old" as CompositionInstanceId,
      status: "active",
      state: { documentId: "doc-1", counter: 1 },
      startedAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-02T03:04:05.000Z",
    });
    const runtime = createCompositionRuntime(
      [{ definition: editor, options: { persistence: store } } as RegisteredComposition],
      { modules: { editor: editorModule }, debug: false },
    );
    const id = runtime.start("editor", { documentId: "doc-1" });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(runtime.getInstance(id)?.updatedAt).toBe("2020-01-02T03:04:05.000Z");
    expect(runtime.getInstance(id)?.startedAt).toBe("2020-01-01T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// #16 — saveDebounceMs coalesces writes
// ---------------------------------------------------------------------------

describe("saveDebounceMs", () => {
  it("collapses a burst of dispatches into one trailing-edge save", async () => {
    vi.useFakeTimers();
    try {
      const saves: SerializedComposition<EditorState>[] = [];
      const store = createMemoryCompositionPersistence<{ documentId: string }, EditorState>({
        keyFor: ({ compositionId, input }) => `${compositionId}:${input.documentId}`,
      });
      // Wrap save to count calls.
      const persistence: CompositionPersistence<EditorState, { documentId: string }> = {
        keyFor: store.keyFor,
        load: store.load,
        save: (key, blob) => {
          saves.push(blob);
          store.save(key, blob);
        },
        remove: store.remove,
      };
      const runtime = createCompositionRuntime(
        [
          {
            definition: editor,
            options: { persistence, saveDebounceMs: 100 },
          } as RegisteredComposition,
        ],
        { modules: { editor: editorModule }, debug: false },
      );
      const id = runtime.start("editor", { documentId: "doc-1" });
      // Drain the load probe — the cold-start save bypasses debounce.
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      const baselineSaves = saves.length;
      // Burst of 5 dispatches in <100ms — should coalesce.
      for (let i = 0; i < 5; i++) {
        runtime.dispatch<EditorState>(id, { counter: i + 1 });
        await vi.advanceTimersByTimeAsync(10);
      }
      // No save yet — the debounce timer is still pending.
      expect(saves.length).toBe(baselineSaves);
      // Now let the debounce fire.
      await vi.advanceTimersByTimeAsync(200);
      expect(saves.length - baselineSaves).toBe(1);
      expect(saves[saves.length - 1].state.counter).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending debounce on disposal without re-saving", async () => {
    vi.useFakeTimers();
    try {
      const saves: SerializedComposition<EditorState>[] = [];
      const removes: string[] = [];
      const store = createMemoryCompositionPersistence<{ documentId: string }, EditorState>({
        keyFor: ({ compositionId, input }) => `${compositionId}:${input.documentId}`,
      });
      const persistence: CompositionPersistence<EditorState, { documentId: string }> = {
        keyFor: store.keyFor,
        load: store.load,
        save: (key, blob) => {
          saves.push(blob);
          store.save(key, blob);
        },
        remove: (key) => {
          removes.push(key);
          store.remove(key);
        },
      };
      const runtime = createCompositionRuntime(
        [
          {
            definition: editor,
            options: { persistence, saveDebounceMs: 100 },
          } as RegisteredComposition,
        ],
        { modules: { editor: editorModule }, debug: false },
      );
      const id = runtime.start("editor", { documentId: "doc-1" });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      const baseline = saves.length;
      runtime.dispatch<EditorState>(id, { counter: 1 });
      runtime.end(id);
      await vi.advanceTimersByTimeAsync(500);
      // No new save fired after disposal.
      expect(saves.length).toBe(baseline);
      // Remove fired exactly once for the disposed instance.
      expect(removes).toEqual(["editor:doc-1"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Retry counter reset (#5)
// ---------------------------------------------------------------------------

describe("__resetRetry visibility", () => {
  it("exposes a __resetRetry that drops the per-zone counter", () => {
    const runtime = makeRuntime();
    const id = runtime.start("editor", { documentId: "doc-1" });
    const internals = getInternals(runtime);
    expect(internals.__consumeRetry(id, "z", 2)).toBe(true);
    expect(internals.__consumeRetry(id, "z", 2)).toBe(true);
    expect(internals.__consumeRetry(id, "z", 2)).toBe(false);
    internals.__resetRetry(id, "z");
    expect(internals.__consumeRetry(id, "z", 2)).toBe(true);
  });
});
