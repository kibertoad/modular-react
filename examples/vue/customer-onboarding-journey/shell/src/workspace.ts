import { createWorkspaceTabsStore } from "./stores/workspace-tabs.js";
import { createWorkspaceActions } from "./services/workspace-actions.js";

// The shell is a single app instance, so the tab store + actions are plain
// module singletons: `main.ts` registers `workspace` as a shared service and
// drives rehydration; components import `workspaceTabs` for reactive reads.
export const workspaceTabs = createWorkspaceTabsStore();
export const workspace = createWorkspaceActions(workspaceTabs);
