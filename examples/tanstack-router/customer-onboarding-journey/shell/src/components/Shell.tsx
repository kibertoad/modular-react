import type { ReactElement } from "react";
import { Outlet } from "@tanstack/react-router";
import type { StoreApi } from "zustand/vanilla";
import type { JourneyRuntime } from "@modular-react/journeys";
import { JourneyProvider } from "@modular-react/journeys";
import type { WorkspaceActions } from "@example-tsr-onboarding/app-shared";
import type { WorkspaceTabsState } from "../stores/workspace-tabs.js";
import { TabStrip } from "./TabStrip.js";

export interface ShellProps {
  readonly runtimeRef: { current: JourneyRuntime | null };
  readonly tabsStore: StoreApi<WorkspaceTabsState>;
  readonly workspace: WorkspaceActions;
}

/**
 * TanStack root component — wraps the whole tree in `<JourneyProvider>` so
 * the outlet and module tabs rendered inside the content area can read the
 * runtime from context. `<Outlet />` hosts the index route (HomeOrTab).
 */
export function createShell({ runtimeRef, tabsStore, workspace }: ShellProps): () => ReactElement {
  return function Shell(): ReactElement {
    // runtimeRef.current is set in main.tsx right after registry.resolve(); it
    // is guaranteed non-null before the first render that reaches this point.
    const runtime = runtimeRef.current!;
    return (
      <JourneyProvider
        runtime={runtime}
        onModuleExit={(ev) => console.debug("[global module exit]", ev)}
      >
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
          <header
            style={{
              padding: "0.75rem 1.5rem",
              borderBottom: "1px solid #e2e8f0",
              backgroundColor: "white",
            }}
          >
            <span style={{ fontSize: "0.875rem", color: "#4a5568" }}>
              Customer Onboarding Journey — <code>@modular-react/journeys</code> · TanStack Router
            </span>
          </header>
          <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            <TabStrip tabsStore={tabsStore} workspace={workspace} />
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <Outlet />
            </div>
          </div>
        </div>
      </JourneyProvider>
    );
  };
}
