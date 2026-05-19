import { createCompositionContext } from "@modular-react/compositions";
import type { EditorState } from "./state.js";

/** See RR sibling for the contract-co-location rationale. */
export const createEditorHooks = () => createCompositionContext<EditorState>();
