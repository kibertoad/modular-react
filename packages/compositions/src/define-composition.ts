import type { CatalogMeta, ModuleTypeMap } from "@modular-react/core";
import type { CompositionDefinition, ZoneMap } from "./types.js";

/**
 * Declare a composition with full type inference on zones, state, and input.
 *
 * **Why the empty parens?** TypeScript can't partially infer generics: if
 * `defineComposition` took every generic in one call, callers would have
 * to spell all of them (losing zone-name literal inference) or none
 * (losing TModules / TState narrowing). The two-call shape lets the
 * caller pin `TModules` + `TState` (+ optional `TMeta`) up front while
 * `TInput` and the `const`-narrowed `TZones` are inferred from the
 * definition object.
 *
 * ```ts
 * defineComposition<AppModules, EditorState>()({
 *   id: "editor",
 *   version: "1.0.0",
 *   initialState: (input: { documentId: string }) => ({
 *     documentId: input.documentId,
 *     activeIntegrationId: null,
 *   }),
 *   zones: {
 *     editorMain: { select: ({ state }) => ({ kind: "module-entry", module: "editor", entry: "main", input: { documentId: state.documentId } }) },
 *     left:       { select: ({ state }) => state.activeIntegrationId
 *                                         ? { kind: "module-entry", module: state.activeIntegrationId, entry: "sourcePanel", input: { documentId: state.documentId } }
 *                                         : { kind: "empty" } },
 *   },
 * });
 * ```
 *
 * The `const TZones` inference on the inner call preserves zone names as
 * literal strings — `"editorMain" | "left"` — so the render-prop site of
 * `<CompositionOutlet>` fails at compile on typos.
 *
 * Zero runtime cost — the definition is returned unchanged.
 */
export const defineComposition =
  <
    TModules extends ModuleTypeMap,
    TState,
    TMeta extends { [K in keyof TMeta]: unknown } = Record<string, unknown>,
  >() =>
  <TInput = void, const TZones extends ZoneMap<TModules, TState> = ZoneMap<TModules, TState>>(
    definition: CompositionDefinition<TModules, TZones, TState, TInput, CatalogMeta & TMeta>,
  ): CompositionDefinition<TModules, TZones, TState, TInput, CatalogMeta & TMeta> =>
    definition;

/**
 * Identity helper that ties a composition handle to its typed input.
 * Mirrors `defineJourneyHandle` — the handle's only runtime field is `id`,
 * the rest is phantom typing.
 *
 * ```ts
 * export const editorComposition = defineCompositionHandle<"editor", { documentId: string }>({
 *   id: "editor",
 * });
 * // runtime.start(editorComposition, { documentId: "doc-1" })
 * ```
 */
export function defineCompositionHandle<TId extends string, TInput = void>(handle: {
  readonly id: TId;
}): {
  readonly id: TId;
  readonly __input?: TInput;
} {
  return handle;
}
