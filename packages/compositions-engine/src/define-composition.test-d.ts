import { assertType, describe, expectTypeOf, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import { defineComposition, defineCompositionHandle } from "./define-composition.js";
import type { CompositionZoneResolution } from "./types.js";

// --- Fixture modules ---------------------------------------------------------

const editorModule = defineModule({
  id: "editor",
  version: "1.0.0",
  exitPoints: {
    saved: defineExit(),
  },
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

describe("defineComposition typing", () => {
  it("preserves literal zone names from const inference", () => {
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
        editorTools: {
          select: ({ state }) => ({
            kind: "module-entry",
            module: "editor",
            entry: "tools",
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

    // Zone names are preserved as literal strings.
    expectTypeOf<keyof typeof editor.zones>().toEqualTypeOf<
      "editorMain" | "editorTools" | "integrationSource"
    >();
  });

  it("constrains zone selector return to known module ids", () => {
    defineComposition<AppModules, EditorState>()({
      id: "editor",
      version: "1.0.0",
      initialState: () => ({ documentId: "", activeIntegrationId: null }),
      zones: {
        left: {
          // @ts-expect-error — "unknown-module" is not in TModules
          select: () => ({ kind: "module-entry", module: "unknown-module", entry: "x" }),
        },
      },
    });
  });

  it("defineCompositionHandle preserves TInput phantom typing", () => {
    const handle = defineCompositionHandle<"editor", { documentId: string }>({ id: "editor" });
    expectTypeOf(handle.id).toEqualTypeOf<"editor">();
    type Inferred = Exclude<typeof handle.__input, undefined>;
    assertType<Inferred>({ documentId: "doc-1" });
  });

  it("CompositionZoneResolution is a discriminated union over `kind`", () => {
    const select = (): CompositionZoneResolution<AppModules> => ({ kind: "empty" });
    const resolution = select();
    if (resolution.kind === "module-entry") {
      // narrowed:
      expectTypeOf(resolution.module).toEqualTypeOf<"editor" | "contentful">();
    }
  });
});
