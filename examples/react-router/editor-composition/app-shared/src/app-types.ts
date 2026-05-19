/**
 * Shared registry dependencies for the editor-composition example. Modules
 * declare which keys they need via `requires` — this app's modules are
 * dependency-free, so it stays minimal.
 *
 * Owned by the shell team. The composition-specific state shape and hooks
 * live in `compositions/editor/` so the composition team owns its
 * contract independently. Mirrors how journey examples keep journey state
 * out of `app-shared`.
 */
export interface AppDependencies {
  readonly auth: { readonly userId: string };
}

/** No slot contributions in this example — kept for parity with siblings. */
export interface AppSlots {
  readonly commands: readonly { readonly id: string; readonly label: string }[];
}
