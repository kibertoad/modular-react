import type { StoreApi } from "zustand/vanilla";
import type {
  AddJourneyTabResult,
  AddJourneyTabSpec,
  OpenTabResult,
  OpenTabSpec,
  WorkspaceActions,
} from "@example-tsr-onboarding/app-shared";
import type { WorkspaceTabsState } from "../stores/workspace-tabs.js";

function mintTabId(kind: "module" | "journey", key: string): string {
  // Must be unique across reloads, because persisted tabs carry their old ids
  // into the rehydrated store. A monotonic in-memory counter would reset to 1
  // on reload and collide with persisted tabs (the store then silently
  // activates the existing tab instead of opening a new one).
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const suffix = cryptoObj?.randomUUID
    ? cryptoObj.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${kind}:${key}:${suffix}`;
}

/**
 * Wire the workspace actions. Pure tab bookkeeping — the journey runtime is
 * not a dependency here. Callers that want to start a journey do so via
 * `useJourneyContext()` (or `manifest.journeys` at bootstrap) and then hand
 * the resulting `instanceId` to `addJourneyTab` below.
 */
export function createWorkspaceActions(tabsStore: StoreApi<WorkspaceTabsState>): WorkspaceActions {
  function openTab(spec: OpenTabSpec): OpenTabResult {
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

  function addJourneyTab(spec: AddJourneyTabSpec): AddJourneyTabResult {
    const existing = tabsStore.getState().findJourneyTabByInstance(spec.instanceId);
    if (existing) {
      tabsStore.getState().activateTab(existing.tabId);
      return { tabId: existing.tabId, alreadyOpen: true };
    }
    const tabId = mintTabId("journey", spec.journeyId);
    tabsStore.getState().addTab({
      tabId,
      kind: "journey",
      title: spec.title ?? spec.journeyId,
      journeyId: spec.journeyId,
      instanceId: spec.instanceId,
      input: spec.input,
    });
    return { tabId, alreadyOpen: false };
  }

  return {
    openTab,
    addJourneyTab,
    /** @deprecated Use `openTab({ kind: 'module', id, input })` instead. */
    openModuleTab: (moduleId, input) => openTab({ kind: "module", id: moduleId, input }),
    closeTab: (tabId) => tabsStore.getState().removeTab(tabId),
  };
}
