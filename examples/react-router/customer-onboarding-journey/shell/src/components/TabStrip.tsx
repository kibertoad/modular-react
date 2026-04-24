import { useSyncExternalStore } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceActions } from "@example-onboarding/app-shared";
import type { WorkspaceTabsState } from "../stores/workspace-tabs.js";

export interface TabStripProps {
  readonly tabsStore: StoreApi<WorkspaceTabsState>;
  readonly workspace: WorkspaceActions;
}

export function TabStrip({ tabsStore, workspace }: TabStripProps) {
  const state = useSyncExternalStore(tabsStore.subscribe, tabsStore.getState);

  return (
    <nav
      aria-label="Open tabs"
      style={{
        borderRight: "1px solid #e2e8f0",
        padding: "1rem",
        backgroundColor: "white",
        minWidth: "240px",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <button
        type="button"
        onClick={() => tabsStore.getState().activateTab(null)}
        style={{
          textAlign: "left",
          backgroundColor: state.activeTabId === null ? "#ebf8ff" : "white",
          color: state.activeTabId === null ? "#2b6cb0" : "#2d3748",
          borderColor: state.activeTabId === null ? "#bee3f8" : "#cbd5e0",
        }}
      >
        Home
      </button>

      <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "0.25rem 0" }} />

      {state.tabs.length === 0 && (
        <p style={{ color: "#718096", fontSize: "0.85rem" }}>No tabs open.</p>
      )}

      {state.tabs.map((tab) => {
        const active = tab.tabId === state.activeTabId;
        return (
          <div
            key={tab.tabId}
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: "0.25rem",
            }}
          >
            <button
              type="button"
              onClick={() => tabsStore.getState().activateTab(tab.tabId)}
              style={{
                flex: 1,
                textAlign: "left",
                backgroundColor: active ? "#ebf8ff" : "white",
                color: active ? "#2b6cb0" : "#2d3748",
                borderColor: active ? "#bee3f8" : "#cbd5e0",
              }}
              title={tab.title}
            >
              {tab.title}
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              onClick={() => workspace.closeTab(tab.tabId)}
              style={{ padding: "0.4rem 0.5rem" }}
            >
              ×
            </button>
          </div>
        );
      })}
    </nav>
  );
}
