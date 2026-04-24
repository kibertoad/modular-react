import { useSyncExternalStore } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { ModuleDescriptor } from "@modular-react/core";
import type { WorkspaceActions } from "@example-tsr-onboarding/app-shared";
import type { WorkspaceTabsState } from "../stores/workspace-tabs.js";
import { Home } from "./Home.js";
import { TabContent } from "./TabContent.js";

export interface HomeOrTabProps {
  readonly tabsStore: StoreApi<WorkspaceTabsState>;
  readonly workspace: WorkspaceActions;
  readonly moduleDescriptors: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
}

/**
 * The TanStack index route — renders either the Home customer picker (when
 * no tab is active) or the active tab's content. Replaces what the React
 * Router variant expresses as two sibling components under a routeless shell.
 */
export function HomeOrTab({ tabsStore, workspace, moduleDescriptors }: HomeOrTabProps) {
  const state = useSyncExternalStore(tabsStore.subscribe, tabsStore.getState);

  if (state.activeTabId === null) {
    return <Home workspace={workspace} tabsStore={tabsStore} />;
  }

  const tab = state.tabs.find((t) => t.tabId === state.activeTabId);
  if (!tab) {
    return <Home workspace={workspace} tabsStore={tabsStore} />;
  }

  return (
    <main style={{ padding: "1.5rem", flex: 1, backgroundColor: "#f7fafc" }}>
      <TabContent tab={tab} workspace={workspace} moduleDescriptors={moduleDescriptors} />
    </main>
  );
}
