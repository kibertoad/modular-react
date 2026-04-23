import type { ModuleDescriptor } from "@modular-react/core";
import { JourneyOutlet, ModuleTab } from "@modular-react/journeys";
import type { WorkspaceActions } from "@example-tsr-onboarding/app-shared";
import type { Tab } from "../stores/workspace-tabs.js";

export interface TabContentProps {
  readonly tab: Tab;
  readonly workspace: WorkspaceActions;
  readonly moduleDescriptors: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
}

function LoadingFallback() {
  return <div style={{ color: "#4a5568" }}>Loading journey…</div>;
}

export function TabContent({ tab, workspace, moduleDescriptors }: TabContentProps) {
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
