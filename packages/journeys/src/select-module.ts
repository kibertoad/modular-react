import type { EntryInputOf, EntryNamesOf, ModuleTypeMap, StepSpec } from "@modular-react/core";

/**
 * One case in a `selectModule` map: an entry name on module `M` plus the
 * matching input shape. The mapped object union is collapsed via the
 * indexed-access trick at the end so the resulting type is a discriminated
 * union over the module's entries (the same shape `StepSpec` uses).
 */
type StepCaseFor<TModules extends ModuleTypeMap, M extends keyof TModules & string> = {
  [E in EntryNamesOf<TModules[M]> & string]: {
    readonly entry: E;
    readonly input: EntryInputOf<TModules[M], E>;
  };
}[EntryNamesOf<TModules[M]> & string];

/**
 * Cases map for the exhaustive form `selectModule(key, cases)` — one case
 * per discriminator value. Each case's `entry` is narrowed against that
 * module's `entryPoints`; `input` is checked against that entry. Missing a
 * key is a compile error, so a journey gains exhaustiveness for free when
 * the discriminator is a union literal.
 */
export type SelectModuleCases<
  TModules extends ModuleTypeMap,
  TKey extends keyof TModules & string,
> = {
  readonly [M in TKey]: StepCaseFor<TModules, M>;
};

/**
 * Cases map for the fallback form `selectModuleOrDefault(key, cases,
 * fallback)`. Every case is optional and any discriminator value not
 * present in `cases` falls through to the explicit fallback `StepSpec`.
 * `TKey` is intentionally widened to `string` so callers can pass a
 * discriminator that includes values outside the module map (the fallback
 * handles them).
 *
 * Keys are constrained to `Extract<TKey, keyof TModules>` so a typo on a
 * module id still errors — the looseness is only on TKey itself, not on
 * which module ids the cases object accepts.
 */
export type SelectModuleCasesPartial<TModules extends ModuleTypeMap, TKey extends string> = {
  readonly [M in Extract<TKey, keyof TModules & string>]?: StepCaseFor<TModules, M>;
};

/**
 * Curried helper for state-driven module dispatch in a transition handler.
 *
 * `selectModule<TModules>()` binds the journey's module map; the inner call
 * takes a discriminator (`key`) whose value names the next module and a
 * cases object that supplies the entry + input for each branch. Returns a
 * `StepSpec` ready to drop into `{ next }`.
 *
 * **Why curry on `TModules`?** Same partial-inference reason as
 * `defineJourney`: TypeScript can't infer `TKey` while we're also forcing
 * `TModules` to be specified — splitting the calls lets us spell the module
 * map once and let the discriminator's union flow naturally into `TKey`.
 *
 * **Exhaustive by design.** The cases object is `Record<TKey, …>`, so when
 * `key` is a union literal (`"github" | "strapi" | "contentful"`),
 * forgetting a branch is a compile error. When you want a default-everything
 * fallback instead of branch-by-branch coverage, use
 * {@link selectModuleOrDefault}.
 *
 * **What you get:**
 * - **Per-branch input checking** — each case's `entry` and `input` are
 *   typed against the module the branch dispatches to. You can't paste a
 *   `strapi`-shaped input under the `github` key.
 * - **One state-spread instead of N** — call sites no longer repeat
 *   `{ state, next: { … } }` per branch.
 *
 * **Limit:** the discriminator key must equal the target module id. When
 * the discriminator differs from the id (e.g. `tier: "free" | "paid"`
 * dispatching to module ids `trial-onboarding` / `billing-onboarding`),
 * fall back to a `switch` returning `next` per branch — that case isn't
 * common enough yet to justify a second helper.
 *
 * @example
 * ```ts
 * import { selectModule } from "@modular-react/journeys";
 *
 * const select = selectModule<IntegrationModules>();
 *
 * chosen: ({ output, state }) => ({
 *   state: { ...state, selected: output.kind },
 *   next: select(output.kind, {
 *     github:     { entry: "configure", input: { workspaceId: state.workspaceId } },
 *     strapi:     { entry: "configure", input: { workspaceId: state.workspaceId } },
 *     contentful: { entry: "configure", input: { workspaceId: state.workspaceId } },
 *   }),
 * }),
 * ```
 *
 * Zero runtime cost beyond an object lookup.
 */
export const selectModule =
  <TModules extends ModuleTypeMap>() =>
  <TKey extends keyof TModules & string>(
    key: TKey,
    cases: SelectModuleCases<TModules, TKey>,
  ): StepSpec<TModules> => {
    // `hasOwn`-gate the lookup so prototype-chain keys (`__proto__`,
    // `toString`, …) can't masquerade as a valid branch when types are
    // bypassed at runtime — `cases["__proto__"]` would otherwise return
    // Object.prototype and produce a malformed StepSpec. With the gate,
    // the no-match path falls into the throw below.
    if (!hasOwnCase(cases, key)) {
      // Reachable only when types are bypassed (a runtime value escaped the
      // discriminator's union, e.g. via a serialized blob). Throw with the
      // offending key in the message — silently producing an invalid
      // StepSpec would fail later inside the runtime with a far less
      // actionable error.
      throw new Error(
        `[@modular-react/journeys] selectModule: no case for key "${String(key)}". ` +
          `Use selectModuleOrDefault if a fallback is intentional.`,
      );
    }
    return moduleStep(key, cases[key]);
  };

/**
 * Sibling of {@link selectModule} that allows partial cases plus an
 * explicit fallback `StepSpec`. Use when most discriminator values funnel
 * into a generic module and only a few warrant their own specific
 * dispatch.
 *
 * Kept as a separate function (rather than a third argument on
 * `selectModule`) so that the *exhaustive* call site is visually
 * distinct from the *fallback-allowed* one — losing exhaustiveness in
 * `selectModule` by accidentally adding a third argument later would
 * silently disable the missing-branch compile error.
 *
 * The cases object is `Partial<Record<TKey, …>>`; any discriminator value
 * not present uses `fallback`. The fallback is a full `StepSpec`
 * (carrying its own `module`) since it isn't keyed by the discriminator.
 *
 * @example
 * ```ts
 * import { selectModuleOrDefault } from "@modular-react/journeys";
 *
 * const select = selectModuleOrDefault<IntegrationModules>();
 *
 * chosen: ({ output, state }) => ({
 *   state: { ...state, selected: output.kind },
 *   next: select(
 *     output.kind,
 *     {
 *       github: { entry: "configure", input: { workspaceId: state.workspaceId, repo: output.repo } },
 *     },
 *     { module: "generic", entry: "configure", input: { workspaceId: state.workspaceId, kind: output.kind } },
 *   ),
 * }),
 * ```
 */
export const selectModuleOrDefault =
  <TModules extends ModuleTypeMap>() =>
  <TKey extends string>(
    key: TKey,
    cases: SelectModuleCasesPartial<TModules, TKey>,
    fallback: StepSpec<TModules>,
  ): StepSpec<TModules> => {
    // `hasOwn`-gate (see selectModule) so prototype-chain keys can't slip
    // a malformed branch past the fallback path.
    if (!hasOwnCase(cases, key)) return fallback;
    const branch = (cases as Record<string, StepCaseFor<TModules, never>>)[key];
    return moduleStep(key, branch);
  };

/**
 * Shared step-builder used by both helpers. Lifted out so the runtime
 * behaviour is identical and any future tweak (e.g. dev-mode freezing)
 * lives in one place.
 *
 * The cast is necessary because TS can't see that
 * `{ module: key, entry: branch.entry, input: branch.input }` aligns with
 * the discriminated `StepSpec` union — but the cases-object constraint
 * (StepCaseFor<TModules, M>) guarantees the alignment per branch.
 */
function moduleStep<TModules extends ModuleTypeMap>(
  key: string,
  branch: { readonly entry: string; readonly input: unknown },
): StepSpec<TModules> {
  return {
    module: key,
    entry: branch.entry,
    input: branch.input,
  } as StepSpec<TModules>;
}

/**
 * Own-property check used by both helpers before indexing into `cases`.
 * Without this gate, a runtime key like `"__proto__"` or `"toString"`
 * (reachable when the discriminator's typing has been bypassed) would
 * resolve to `Object.prototype` and produce a malformed StepSpec instead
 * of falling into the throw / fallback path.
 */
function hasOwnCase(cases: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(cases, key);
}
