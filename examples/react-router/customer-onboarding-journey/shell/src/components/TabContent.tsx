import { useSyncExternalStore } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { ModuleDescriptor } from "@modular-react/core";
import { JourneyOutlet, ModuleTab } from "@modular-react/journeys";
import type { WorkspaceActions } from "@example-onboarding/app-shared";
import type { WorkspaceTabsState, Tab } from "../stores/workspace-tabs.js";

export interface TabContentProps {
  readonly tabsStore: StoreApi<WorkspaceTabsState>;
  readonly workspace: WorkspaceActions;
  readonly moduleDescriptors: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
}

function LoadingFallback() {
  return <div style={{ color: "#4a5568" }}>Loading journey…</div>;
}

export function TabContent({ tabsStore, workspace, moduleDescriptors }: TabContentProps) {
  const state = useSyncExternalStore(tabsStore.subscribe, tabsStore.getState);

  if (state.activeTabId === null) return null;
  const tab = state.tabs.find((t) => t.tabId === state.activeTabId);
  if (!tab) return null;

  return (
    <main style={{ flex: 1, padding: "1.5rem", backgroundColor: "#f7fafc" }}>
      <TabBody tab={tab} workspace={workspace} moduleDescriptors={moduleDescriptors} />
    </main>
  );
}

function TabBody({
  tab,
  workspace,
  moduleDescriptors,
}: {
  readonly tab: Tab;
  readonly workspace: WorkspaceActions;
  readonly moduleDescriptors: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
}) {
  if (tab.kind === "journey") {
    // Runtime + module map come from the <JourneyProvider> mounted in main.tsx —
    // no prop threading needed.
    return (
      <JourneyOutlet
        instanceId={tab.instanceId}
        loadingFallback={<LoadingFallback />}
        onFinished={() => workspace.closeTab(tab.tabId)}
      />
    );
  }

  const mod = moduleDescriptors[tab.moduleId];
  if (!mod) {
    return <p style={{ color: "#c53030" }}>Module "{tab.moduleId}" is not registered.</p>;
  }
  return (
    <ModuleTab
      module={mod}
      entry={tab.entry}
      input={tab.input}
      tabId={tab.tabId}
      onExit={(ev) => {
        workspace.closeTab(tab.tabId);
        // `onModuleExit` wired on the provider also fires — see main.tsx.
        console.debug("[module exit]", ev);
      }}
    />
  );
}
