/**
 * Framework-neutral stand-ins for a UI framework's component and node types.
 *
 * The core carries components as opaque values — it never renders, calls, or
 * inspects them, so it depends on no UI framework. Each framework binding
 * (`@modular-react/core`, a future `@modular-vue/core`) refines these to its
 * own component type where authoring ergonomics matter.
 *
 * `UiComponent<P>` defaults to "callable or constructable with props `P`",
 * which admits React's full `ComponentType` (function components via the call
 * arm, class components via the construct arm) as well as any other
 * function/constructor component, and stays usable as a JSX element type in a
 * React binding without pulling in `@types/react`. The call arm keeps function
 * components props-checked against `ModuleEntryProps`. A Vue binding can narrow
 * the alias to Vue's component type instead.
 *
 * The two arms differ in how strictly they check `P`, and that asymmetry is the
 * seam class-component frameworks rely on:
 *
 * - The **call arm** (`(props: P) => any`) checks `P` structurally: a function
 *   component whose parameter is incompatible with the entry's props is
 *   rejected. This is what keeps React function components honest.
 * - The **construct arm** (`new (props: P) => any`) admits any
 *   zero-argument-constructor class *with `P` left unchecked*. Under the repo's
 *   strict tsconfig a constructor that takes fewer parameters is assignable to
 *   one that supplies more, so `class Foo {}` — and any class whose constructor
 *   ignores props — satisfies `UiComponent<P>` for every `P`. The props type is
 *   simply never consulted for a zero-arg constructor. (A class that *does*
 *   declare a required constructor parameter is only admitted when `P` is
 *   assignable to that parameter's type, so the arm is not an unconditional
 *   pass-through for arbitrary classes.)
 *
 * This is why class-component frameworks bind by narrowing rather than by
 * leaning on the arm's structural check. Angular's `@Component` classes take DI
 * dependencies in their constructor, not props, and cannot express
 * `ModuleEntryProps` through the constructor signature the way a function
 * component expresses it through its parameter. A class-component binding
 * therefore narrows `UiComponent` to its own framework's component type
 * (`Type<unknown>` for Angular) and enforces the entry's input shape *out of
 * band* — through an authoring helper (e.g. `moduleEntry<TInput>(cmp)`) that
 * pins the component's declared inputs (signal inputs matching
 * `ModuleEntryProps` fields for Angular) rather than through this alias. See the
 * Angular support tracker (AD5) for the narrowing contract.
 *
 * The `ui-types.test-d.ts` companion pins the zero-arg-class admission so a
 * future tightening of this seam cannot silently break class-component bindings.
 */
export type UiComponent<P = any> = ((props: P) => any) | (new (props: P) => any);

/**
 * Framework-neutral stand-in for a renderable node — React's `ReactNode`, a
 * Vue `VNode`, or any other framework's node type. The core never inspects a
 * node, so it stays deliberately loose (`any`) rather than `unknown`: bindings
 * pass these values straight into their framework's render slots (e.g. a
 * React `<Suspense fallback>`), which `unknown` would reject.
 */
export type UiNode = any;
