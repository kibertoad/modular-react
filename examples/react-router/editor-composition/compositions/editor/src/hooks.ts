import { createCompositionContext } from "@modular-react/compositions";
import type { EditorState } from "./state.js";

/**
 * Pre-typed hook bundle so foreign panel modules don't have to spell
 * `<EditorState>` at every call site. Co-located with the composition
 * definition (not in `app-shared`) so the composition team owns its full
 * contract — state shape + hooks + runtime definition — in one package.
 */
export const createEditorHooks = () => createCompositionContext<EditorState>();
