import { defineComponent, h, nextTick, type PropType } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";

import { createCompositionRuntime, defineComposition } from "@modular-frontend/compositions-engine";
import type { RegisteredComposition } from "@modular-frontend/compositions-engine";
import { CompositionOutlet } from "./outlet.js";
import { CompositionsProvider } from "./provider.js";
import {
  useCompositionDispatch,
  useCompositionEmit,
  useCompositionState,
  useCompositionZone,
} from "./hooks.js";

// --- Fixture modules ---------------------------------------------------------

interface EditorState {
  readonly documentId: string;
  readonly activeIntegrationId: "contentful" | "strapi" | null;
  readonly selectedSourceItem: string | null;
}

const EditorMainPanel = defineComponent({
  name: "EditorMainPanel",
  props: {
    input: { type: Object as PropType<{ documentId: string }>, required: true },
    exit: { type: Function, default: undefined },
  },
  setup(props) {
    const selected = useCompositionState<EditorState, string | null>((s) => s.selectedSourceItem);
    return () =>
      h(
        "div",
        { "data-testid": "editor-main" },
        `doc=${props.input.documentId} selected=${selected.value ?? "—"}`,
      );
  },
});

const ContentfulSourcePanel = defineComponent({
  name: "ContentfulSourcePanel",
  props: {
    input: { type: Object as PropType<{ documentId: string }>, required: true },
    exit: { type: Function, default: undefined },
  },
  setup(props) {
    const dispatch = useCompositionDispatch<EditorState>();
    const emit = useCompositionEmit();
    const zone = useCompositionZone();
    return () =>
      h("div", { "data-testid": "contentful-panel", "data-zone": zone.zone }, [
        `contentful for ${props.input.documentId}`,
        h(
          "button",
          {
            "data-testid": "select-item",
            onClick: () => dispatch({ selectedSourceItem: "entry-42" }),
          },
          "select",
        ),
        h(
          "button",
          {
            "data-testid": "emit-event",
            onClick: () => emit({ kind: "exit", payload: { ok: true } }),
          },
          "emit",
        ),
      ]);
  },
});

const StrapiSourcePanel = defineComponent({
  name: "StrapiSourcePanel",
  props: {
    input: { type: Object as PropType<{ documentId: string }>, required: true },
    exit: { type: Function, default: undefined },
  },
  setup(props) {
    return () =>
      h("div", { "data-testid": "strapi-panel" }, `strapi for ${props.input.documentId}`);
  },
});

const editorModule = defineModule({
  id: "editor",
  version: "1.0.0",
  exitPoints: { saved: defineExit() },
  entryPoints: {
    main: defineEntry({
      component: EditorMainPanel as never,
      input: schema<{ documentId: string }>(),
    }),
  },
});

const contentfulModule = defineModule({
  id: "contentful",
  version: "1.0.0",
  entryPoints: {
    sourcePanel: defineEntry({
      component: ContentfulSourcePanel as never,
      input: schema<{ documentId: string }>(),
    }),
  },
});

const strapiModule = defineModule({
  id: "strapi",
  version: "1.0.0",
  entryPoints: {
    sourcePanel: defineEntry({
      component: StrapiSourcePanel as never,
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
      fallback: defineComponent({
        name: "EmptyFallback",
        setup() {
          return () => h("div", { "data-testid": "empty-fallback" }, "pick an integration");
        },
      }),
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

/** Mount `<CompositionsProvider><CompositionOutlet>…</></>` — the outlet reads
 *  the runtime from context, matching the primary usage path. */
function mountViaProvider(
  runtime: ReturnType<typeof makeRuntime>,
  outletProps: Record<string, unknown>,
  slotFn: (zones: Record<string, unknown>) => unknown,
) {
  return mount(CompositionsProvider, {
    props: { runtime },
    slots: {
      default: () => h(CompositionOutlet, outletProps, { default: slotFn }),
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CompositionOutlet", () => {
  it("renders all zones via the scoped-slot layout", () => {
    const runtime = makeRuntime();
    const id = runtime.start("editor", { documentId: "doc-1" });

    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "editor", instanceId: id },
      (zones) =>
        h("div", [
          h("section", { "data-testid": "main-zone" }, [zones.editorMain]),
          h("aside", { "data-testid": "left-zone" }, [zones.integrationSource]),
        ]),
    );

    expect(wrapper.get('[data-testid="editor-main"]').text()).toContain("doc=doc-1");
    expect(wrapper.find('[data-testid="empty-fallback"]').exists()).toBe(true);
  });

  it("swaps the integration zone when state changes", async () => {
    const runtime = makeRuntime();
    const id = runtime.start("editor", { documentId: "doc-1" });

    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "editor", instanceId: id },
      (zones) => h("div", [zones.editorMain, zones.integrationSource]),
    );

    expect(wrapper.find('[data-testid="contentful-panel"]').exists()).toBe(false);

    runtime.dispatch<EditorState>(id, { activeIntegrationId: "contentful" });
    await nextTick();
    expect(wrapper.get('[data-testid="contentful-panel"]').text()).toContain(
      "contentful for doc-1",
    );

    runtime.dispatch<EditorState>(id, { activeIntegrationId: "strapi" });
    await nextTick();
    expect(wrapper.get('[data-testid="strapi-panel"]').text()).toContain("strapi for doc-1");
  });

  it("foreign panel dispatches state and updates a sibling zone", async () => {
    const runtime = makeRuntime();
    const id = runtime.start("editor", { documentId: "doc-1" });
    runtime.dispatch<EditorState>(id, { activeIntegrationId: "contentful" });

    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "editor", instanceId: id },
      (zones) => h("div", [zones.editorMain, zones.integrationSource]),
    );

    expect(wrapper.get('[data-testid="editor-main"]').text()).toContain("selected=—");
    await wrapper.get('[data-testid="select-item"]').trigger("click");
    expect(wrapper.get('[data-testid="editor-main"]').text()).toContain("selected=entry-42");
  });

  it("emit routes through onZoneEvent with the zone name", async () => {
    const runtime = makeRuntime();
    const id = runtime.start("editor", { documentId: "doc-1" });
    runtime.dispatch<EditorState>(id, { activeIntegrationId: "contentful" });

    const onZoneEvent = vi.fn();
    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "editor", instanceId: id, onZoneEvent },
      (zones) => h("div", [zones.integrationSource]),
    );

    await wrapper.get('[data-testid="emit-event"]').trigger("click");
    expect(onZoneEvent).toHaveBeenCalledWith(
      { kind: "exit", payload: { ok: true } },
      { zone: "integrationSource" },
    );
  });

  it("renders the zone's fallback component when select returns empty", () => {
    const runtime = makeRuntime();
    const id = runtime.start("editor", { documentId: "doc-1" });

    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "editor", instanceId: id },
      (zones) => h("div", [zones.integrationSource]),
    );
    expect(wrapper.find('[data-testid="empty-fallback"]').exists()).toBe(true);
  });

  it("swaps between two entries of the same module based on state", async () => {
    // The conditional-module pattern works at the entry granularity too: a
    // single zone can dispatch between two entries of one module.
    interface PickerState {
      readonly mode: "main" | "tools";
    }
    const ToolsPanel = defineComponent({
      name: "ToolsPanel",
      props: {
        input: { type: null, default: undefined },
        exit: { type: Function, default: undefined },
      },
      setup() {
        return () => h("div", { "data-testid": "editor-tools" }, "tools");
      },
    });
    const editorWithTools = defineModule({
      id: "editor",
      version: "1.0.0",
      exitPoints: { saved: defineExit() },
      entryPoints: {
        main: defineEntry({
          component: EditorMainPanel as never,
          input: schema<{ documentId: string }>(),
        }),
        tools: defineEntry({ component: ToolsPanel as never, input: schema<void>() }),
      },
    });
    type Mods = { readonly editor: typeof editorWithTools };
    const def = defineComposition<Mods, PickerState>()({
      id: "picker",
      version: "1.0.0",
      initialState: () => ({ mode: "main" as const }),
      zones: {
        body: {
          select: ({ state }) => ({
            kind: "module-entry",
            module: "editor",
            entry: state.mode,
            input: state.mode === "main" ? { documentId: "doc-1" } : undefined,
          }),
        },
      },
    });
    const runtime = createCompositionRuntime(
      [{ definition: def, options: undefined } as RegisteredComposition],
      { modules: { editor: editorWithTools }, debug: false },
    );
    const id = runtime.start("picker", undefined);
    const wrapper = mountViaProvider(
      runtime,
      { compositionId: "picker", instanceId: id },
      (zones) => h("div", { "data-testid": "root" }, [zones.body]),
    );
    expect(wrapper.find('[data-testid="editor-main"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="editor-tools"]').exists()).toBe(false);
    runtime.dispatch<PickerState>(id, { mode: "tools" });
    await nextTick();
    expect(wrapper.find('[data-testid="editor-tools"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="editor-main"]').exists()).toBe(false);
  });
});
