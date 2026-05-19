/**
 * Shared registry dependencies for the editor-composition example. Mirror
 * of the React Router sibling — no router-specific types live here, so the
 * file can stay identical between the two shells. Composition-specific
 * state lives in `compositions/editor/`.
 */
export interface AppDependencies {
  readonly auth: { readonly userId: string };
}

/** No slot contributions in this example — kept for parity with siblings. */
export interface AppSlots {
  readonly commands: readonly { readonly id: string; readonly label: string }[];
}
