import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import type { ModuleEntryProps } from "@modular-react/core";

import { defineComposition } from "./define-composition.js";
import { createCompositionRuntime } from "./runtime.js";
import { CompositionOutlet } from "./outlet.js";
import { CompositionsProvider } from "./provider.js";
import {
  useCompositionDispatch,
  useCompositionEmit,
  useCompositionState,
  useCompositionZone,
} from "./hooks.js";
import type { RegisteredComposition } from "./types.js";

afterEach(() => {
  cleanup();
});

// --- Fixture modules ---------------------------------------------------------

interface EditorState {
  readonly documentId: string;
  readonly activeIntegrationId: "contentful" | "strapi" | null;
  readonly selectedSourceItem: string | null;
}

function EditorMainPanel({ input }: ModuleEntryProps<{ documentId: string }>) {
  const selected = useCompositionState<EditorState, string | null>((s) => s.selectedSourceItem);
  return (
    <div data-testid="editor-main">
      doc={input.documentId} selected={selected ?? "—"}
    </div>
  );
}

function ContentfulSourcePanel({ input }: ModuleEntryProps<{ documentId: string }>) {
  const dispatch = useCompositionDispatch<EditorState>();
  const emit = useCompositionEmit();
  const zone = useCompositionZone();
  return (
    <div data-testid="contentful-panel" data-zone={zone.zone}>
      contentful for {input.documentId}
      <button
        data-testid="select-item"
        onClick={() => dispatch({ selectedSourceItem: "entry-42" })}
      >
        select
      </button>
      <button
        data-testid="emit-event"
        onClick={() => emit({ kind: "exit", payload: { ok: true } })}
      >
        emit
      </button>
    </div>
  );
}

function StrapiSourcePanel({ input }: ModuleEntryProps<{ documentId: string }>) {
  return <div data-testid="strapi-panel">strapi for {input.documentId}</div>;
}

const editorModule = defineModule({
  id: "editor",
  version: "1.0.0",
  exitPoints: { saved: defineExit() },
  entryPoints: {
    main: defineEntry({
      component: EditorMainPanel,
      input: schema<{ documentId: string }>(),
    }),
  },
});

const contentfulModule = defineModule({
  id: "contentful",
  version: "1.0.0",
  entryPoints: {
    sourcePanel: defineEntry({
      component: ContentfulSourcePanel,
      input: schema<{ documentId: string }>(),
    }),
  },
});

const strapiModule = defineModule({
  id: "strapi",
  version: "1.0.0",
  entryPoints: {
    sourcePanel: defineEntry({
      component: StrapiSourcePanel,
      input: schema<{ documentId: string }>(),
    }),
  },
});

type AppModules = {
  readonly editor: typeof editorModule;
  readonly contentful: typeof contentfulModule;
  readonly strapi: typeof strapiModule;
};

const editor = defineComposition<AppModules, EditorState>()({
  id: "editor",
  version: "1.0.0",
  initialState: (input: { documentId: string }) => ({
    documentId: input.documentId,
    activeIntegrationId: null,
    selectedSourceItem: null,
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
      fallback: () => <div data-testid="empty-fallback">pick an integration</div>,
    },
  },
});

function makeRuntime() {
  return createCompositionRuntime(
    [{ definition: editor, options: undefined } as RegisteredComposition],
    {
      modules: { editor: editorModule, contentful: contentfulModule, strapi: strapiModule },
      debug: false,
    },
  );
}

describe("CompositionOutlet", () => {
  it("renders all zones via the render-prop layout", () => {
    const runtime = makeRuntime();
    const id = runtime.start("editor", { documentId: "doc-1" });

    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="editor" instanceId={id}>
          {(zones) => (
            <div>
              <section data-testid="main-zone">{zones.editorMain}</section>
              <aside data-testid="left-zone">{zones.integrationSource}</aside>
            </div>
          )}
        </CompositionOutlet>
      </CompositionsProvider>,
    );

    expect(screen.getByTestId("editor-main").textContent).toContain("doc=doc-1");
    expect(screen.getByTestId("empty-fallback")).toBeTruthy();
  });

  it("swaps the integration zone when state changes", () => {
    const runtime = makeRuntime();
    const id = runtime.start("editor", { documentId: "doc-1" });

    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="editor" instanceId={id}>
          {(zones) => (
            <>
              <div data-testid="main-zone">{zones.editorMain}</div>
              <div data-testid="left-zone">{zones.integrationSource}</div>
            </>
          )}
        </CompositionOutlet>
      </CompositionsProvider>,
    );

    expect(screen.queryByTestId("contentful-panel")).toBeNull();

    act(() => {
      runtime.dispatch<EditorState>(id, { activeIntegrationId: "contentful" });
    });
    expect(screen.getByTestId("contentful-panel").textContent).toContain("contentful for doc-1");

    act(() => {
      runtime.dispatch<EditorState>(id, { activeIntegrationId: "strapi" });
    });
    expect(screen.getByTestId("strapi-panel").textContent).toContain("strapi for doc-1");
  });

  it("foreign panel dispatches state and updates a sibling zone", () => {
    const runtime = makeRuntime();
    const id = runtime.start("editor", { documentId: "doc-1" });
    act(() => {
      runtime.dispatch<EditorState>(id, { activeIntegrationId: "contentful" });
    });

    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="editor" instanceId={id}>
          {(zones) => (
            <>
              <div data-testid="main-zone">{zones.editorMain}</div>
              <div data-testid="left-zone">{zones.integrationSource}</div>
            </>
          )}
        </CompositionOutlet>
      </CompositionsProvider>,
    );

    expect(screen.getByTestId("editor-main").textContent).toContain("selected=—");
    act(() => {
      (screen.getByTestId("select-item") as HTMLButtonElement).click();
    });
    expect(screen.getByTestId("editor-main").textContent).toContain("selected=entry-42");
  });

  it("emit routes through onZoneEvent with the zone name", () => {
    const runtime = makeRuntime();
    const id = runtime.start("editor", { documentId: "doc-1" });
    act(() => {
      runtime.dispatch<EditorState>(id, { activeIntegrationId: "contentful" });
    });

    const onZoneEvent = vi.fn();
    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="editor" instanceId={id} onZoneEvent={onZoneEvent}>
          {(zones) => <div>{zones.integrationSource}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );

    act(() => {
      (screen.getByTestId("emit-event") as HTMLButtonElement).click();
    });
    expect(onZoneEvent).toHaveBeenCalledWith(
      { kind: "exit", payload: { ok: true } },
      { zone: "integrationSource" },
    );
  });

  it("renders the zone's fallback component when select returns empty", () => {
    const runtime = makeRuntime();
    const id = runtime.start("editor", { documentId: "doc-1" });

    render(
      <CompositionsProvider runtime={runtime}>
        <CompositionOutlet compositionId="editor" instanceId={id}>
          {(zones) => <div>{zones.integrationSource}</div>}
        </CompositionOutlet>
      </CompositionsProvider>,
    );
    expect(screen.getByTestId("empty-fallback")).toBeTruthy();
  });
});
