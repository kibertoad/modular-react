import type {
  AddJourneyTabResult,
  AddJourneyTabSpec,
  WorkspaceActions,
} from "@example-vue-onboarding/app-shared";
import type { WorkspaceTabsStore } from "../stores/workspace-tabs.js";

function mintTabId(kind: "journey", key: string): string {
  // Must be unique across reloads, because persisted tabs carry their old ids
  // into the rehydrated store. A monotonic in-memory counter would reset to 1
  // on reload and collide with persisted tabs.
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const suffix = cryptoObj?.randomUUID
    ? cryptoObj.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${kind}:${key}:${suffix}`;
}

/**
 * Wire the workspace actions. Pure tab bookkeeping — the journey runtime is not
 * a dependency here. Callers that want to start a journey do so via
 * `useJourneyContext()` (or `manifest.journeys` at bootstrap) and then hand the
 * resulting `instanceId` to `addJourneyTab` below.
 */
export function createWorkspaceActions(tabsStore: WorkspaceTabsStore): WorkspaceActions {
  return {
    addJourneyTab(spec: AddJourneyTabSpec): AddJourneyTabResult {
      const existing = tabsStore.findJourneyTabByInstance(spec.instanceId);
      if (existing) {
        tabsStore.activateTab(existing.tabId);
        return { tabId: existing.tabId, alreadyOpen: true };
      }
      const tabId = mintTabId("journey", spec.journeyId);
      tabsStore.addTab({
        tabId,
        kind: "journey",
        title: spec.title ?? spec.journeyId,
        journeyId: spec.journeyId,
        instanceId: spec.instanceId,
        input: spec.input,
      });
      return { tabId, alreadyOpen: false };
    },
    closeTab: (tabId) => tabsStore.removeTab(tabId),
  };
}
