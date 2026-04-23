import type { StoreApi } from "zustand/vanilla";
import type { JourneyRuntime } from "@modular-react/journeys";
import type {
  OpenTabResult,
  OpenTabSpec,
  WorkspaceActions,
} from "@example-onboarding/app-shared";
import type { WorkspaceTabsState } from "../stores/workspace-tabs.js";

export interface RuntimeRef {
  current: JourneyRuntime | null;
}

let nextTabId = 1;
function mintTabId(kind: "module" | "journey", key: string): string {
  return `${kind}:${key}:${nextTabId++}`;
}

/**
 * Wire the workspace actions. The journey runtime reference is filled in
 * after `registry.resolve()` (which is what creates the runtime), so we
 * accept a mutable box instead of a concrete runtime.
 */
export function createWorkspaceActions(
  tabsStore: StoreApi<WorkspaceTabsState>,
  runtimeRef: RuntimeRef,
): WorkspaceActions {
  function openTab(spec: OpenTabSpec): OpenTabResult {
    if (spec.kind === "journey") {
      const runtime = runtimeRef.current;
      if (!runtime) {
        throw new Error("[workspace] cannot open a journey tab before the registry is resolved");
      }
      const instanceId = runtime.start(spec.id, spec.input);
      const existing = tabsStore.getState().findJourneyTabByInstance(instanceId);
      if (existing) {
        tabsStore.getState().activateTab(existing.tabId);
        return { tabId: existing.tabId, instanceId };
      }
      const tabId = mintTabId("journey", spec.id);
      tabsStore.getState().addTab({
        tabId,
        kind: "journey",
        title: spec.title ?? spec.id,
        journeyId: spec.id,
        instanceId,
        input: spec.input,
      });
      return { tabId, instanceId };
    }

    const tabId = mintTabId("module", spec.id);
    tabsStore.getState().addTab({
      tabId,
      kind: "module",
      title: spec.title ?? spec.id,
      moduleId: spec.id,
      entry: spec.entry,
      input: spec.input,
    });
    return { tabId };
  }

  return {
    openTab,
    /** @deprecated Use `openTab({ kind: 'module', id, input })` instead. */
    openModuleTab: (moduleId, input) => openTab({ kind: "module", id: moduleId, input }),
    closeTab: (tabId) => tabsStore.getState().removeTab(tabId),
  };
}
