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
