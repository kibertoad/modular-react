import { describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { defineComposition } from "./define-composition.js";
import { createCompositionRuntime, getInternals } from "./runtime.js";
import {
  createMemoryCompositionPersistence,
  defineCompositionPersistence,
} from "./persistence.js";
import type { RegisteredComposition } from "./types.js";

// --- Fixture modules ---------------------------------------------------------

const editorModule = defineModule({
  id: "editor",
  version: "1.0.0",
  exitPoints: { saved: defineExit() },
  entryPoints: {
    main: defineEntry({
      component: (() => null) as any,
      input: schema<{ documentId: string }>(),
    }),
    tools: defineEntry({
      component: (() => null) as any,
      input: schema<{ documentId: string }>(),
    }),
  },
});

const contentfulModule = defineModule({
  id: "contentful",
  version: "1.0.0",
  entryPoints: {
    sourcePanel: defineEntry({
      component: (() => null) as any,
      input: schema<{ documentId: string }>(),
    }),
  },
});

type AppModules = {
  readonly editor: typeof editorModule;
  readonly contentful: typeof contentfulModule;
};

interface EditorState {
  readonly documentId: string;
  readonly activeIntegrationId: "contentful" | null;
}

const editor = defineComposition<AppModules, EditorState>()({
  id: "editor",
  version: "1.0.0",
  initialState: (input: { documentId: string }) => ({
    documentId: input.documentId,
    activeIntegrationId: null,
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
    integrationSource: {
      select: ({ state }) =>
        state.activeIntegrationId
          ? {
              kind: "module-entry",
              module: state.activeIntegrationId,
              entry: "sourcePanel",
              input: { documentId: state.documentId },
            }
          : { kind: "empty" },
    },
  },
});

function freshRuntime(overrides: Partial<RegisteredComposition> = {}) {
  return createCompositionRuntime(
    [
      {
        definition: editor,
        options: undefined,
        ...overrides,
      } as RegisteredComposition,
    ],
    { modules: { editor: editorModule, contentful: contentfulModule }, debug: false },
  );
}

describe("CompositionRuntime", () => {
  it("starts an instance with initialState applied", () => {
    const runtime = freshRuntime();
    const id = runtime.start("editor", { documentId: "doc-1" });
    const instance = runtime.getInstance(id);
    expect(instance).not.toBeNull();
    expect(instance?.state).toEqual({
      documentId: "doc-1",
      activeIntegrationId: null,
    });
    expect(instance?.status).toBe("active");
  });

  it("isRegistered reports definition presence", () => {
    const runtime = freshRuntime();
    expect(runtime.isRegistered("editor")).toBe(true);
    expect(runtime.isRegistered("nope")).toBe(false);
  });

  it("throws UnknownCompositionError on missing definition", () => {
    const runtime = freshRuntime();
    expect(() => runtime.start("missing-comp", undefined)).toThrow(/Unknown composition id/);
  });

  it("dispatch mutates state and bumps revision", () => {
    const runtime = freshRuntime();
    const id = runtime.start("editor", { documentId: "doc-1" });
    const internals = getInternals(runtime);
    const recordBefore = internals.__getRecord(id)!;
    const revBefore = recordBefore.revision;

    runtime.dispatch(id, { activeIntegrationId: "contentful" });

    const recordAfter = internals.__getRecord(id)!;
    expect(recordAfter.state).toEqual({
      documentId: "doc-1",
      activeIntegrationId: "contentful",
    });
    expect(recordAfter.revision).toBeGreaterThan(revBefore);
  });

  it("notifies subscribers on dispatch", () => {
    const runtime = freshRuntime();
    const id = runtime.start("editor", { documentId: "doc-1" });
    const listener = vi.fn();
    const unsubscribe = runtime.subscribe(id, listener);

    runtime.dispatch(id, (s) => ({ activeIntegrationId: "contentful", documentId: s.documentId }));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    runtime.dispatch(id, { activeIntegrationId: null });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("supports the updater-function form on dispatch", () => {
    const runtime = freshRuntime();
    const id = runtime.start("editor", { documentId: "doc-1" });
    runtime.dispatch(id, (s) => ({ ...s, activeIntegrationId: "contentful" }));
    expect(runtime.getInstance(id)?.state).toEqual({
      documentId: "doc-1",
      activeIntegrationId: "contentful",
    });
  });

  it("end disposes the instance, fires onDispose, and notifies subscribers", () => {
    const onDispose = vi.fn();
    const definition = { ...editor, onDispose };
    const runtime = createCompositionRuntime(
      [{ definition, options: undefined } as RegisteredComposition],
      { modules: { editor: editorModule, contentful: contentfulModule }, debug: false },
    );
    const id = runtime.start("editor", { documentId: "doc-1" });
    const listener = vi.fn();
    runtime.subscribe(id, listener);

    runtime.end(id, { reason: "test" });
    expect(onDispose).toHaveBeenCalledWith(
      expect.objectContaining({
        compositionId: "editor",
        instanceId: id,
        reason: "test",
      }),
    );
    expect(listener).toHaveBeenCalled();
    expect(runtime.getInstance(id)).toBeNull();
  });

  it("end is idempotent on an unknown id", () => {
    const runtime = freshRuntime();
    expect(() => runtime.end("ci_unknown" as never)).not.toThrow();
  });

  it("idempotent start: same persistence key returns same instance id (after probe)", async () => {
    const persistence = defineCompositionPersistence<{ documentId: string }, EditorState>(
      createMemoryCompositionPersistence({
        keyFor: ({ compositionId, input }) => `${compositionId}:${input.documentId}`,
      }),
    );
    const runtime = createCompositionRuntime(
      [{ definition: editor, options: { persistence } } as RegisteredComposition],
      { modules: { editor: editorModule, contentful: contentfulModule }, debug: false },
    );
    const a = runtime.start("editor", { documentId: "doc-1" });
    // Allow persistence.load microtask to settle (transitions loading → active).
    await Promise.resolve();
    await Promise.resolve();
    const b = runtime.start("editor", { documentId: "doc-1" });
    expect(b).toBe(a);
  });

  it("hydrates persisted state on a subsequent start", async () => {
    const store = createMemoryCompositionPersistence<{ documentId: string }, EditorState>({
      keyFor: ({ compositionId, input }) => `${compositionId}:${input.documentId}`,
    });
    // Seed a blob as if a prior session already saved state.
    store.save(`editor:doc-1`, {
      definitionId: "editor",
      version: "1.0.0",
      instanceId: "ci_seed" as never,
      status: "active",
      state: { documentId: "doc-1", activeIntegrationId: "contentful" },
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const runtime = createCompositionRuntime(
      [{ definition: editor, options: { persistence: store } } as RegisteredComposition],
      { modules: { editor: editorModule, contentful: contentfulModule }, debug: false },
    );
    const id = runtime.start("editor", { documentId: "doc-1" });
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.getInstance(id)?.state).toEqual({
      documentId: "doc-1",
      activeIntegrationId: "contentful",
    });
  });

  it("listInstances / listDefinitions reflect runtime state", () => {
    const runtime = freshRuntime();
    expect(runtime.listInstances()).toEqual([]);
    expect(runtime.listDefinitions().map((d) => d.id)).toEqual(["editor"]);
    const a = runtime.start("editor", { documentId: "doc-1" });
    const b = runtime.start("editor", { documentId: "doc-2" });
    expect(runtime.listInstances().sort()).toEqual([a, b].sort());
  });
});
