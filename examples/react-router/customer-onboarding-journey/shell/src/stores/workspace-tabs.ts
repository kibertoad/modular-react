import { createStore, type StoreApi } from "zustand/vanilla";

export interface JourneyTab {
  readonly tabId: string;
  readonly kind: "journey";
  readonly title: string;
  readonly journeyId: string;
  readonly input: unknown;
  readonly instanceId: string;
}

export interface ModuleTab {
  readonly tabId: string;
  readonly kind: "module";
  readonly title: string;
  readonly moduleId: string;
  readonly entry?: string;
  readonly input?: unknown;
}

export type Tab = JourneyTab | ModuleTab;

export interface WorkspaceTabsState {
  readonly tabs: readonly Tab[];
  readonly activeTabId: string | null;

  readonly addTab: (tab: Tab) => void;
  readonly removeTab: (tabId: string) => void;
  readonly activateTab: (tabId: string | null) => void;
  readonly findJourneyTabByInstance: (instanceId: string) => Tab | null;
}

const STORAGE_KEY = "workspace-tabs";

function loadInitial(): Pick<WorkspaceTabsState, "tabs" | "activeTabId"> {
  if (typeof localStorage === "undefined") {
    return { tabs: [], activeTabId: null };
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { tabs: [], activeTabId: null };
  try {
    const parsed = JSON.parse(raw) as {
      tabs?: readonly Tab[];
      activeTabId?: string | null;
    };
    return {
      tabs: parsed.tabs ?? [],
      activeTabId: parsed.activeTabId ?? null,
    };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return { tabs: [], activeTabId: null };
  }
}

function persist(state: Pick<WorkspaceTabsState, "tabs" | "activeTabId">): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ tabs: state.tabs, activeTabId: state.activeTabId }),
  );
}

export function createWorkspaceTabsStore(): StoreApi<WorkspaceTabsState> {
  const store = createStore<WorkspaceTabsState>((set, get) => ({
    ...loadInitial(),

    addTab: (tab) => {
      set((s) => {
        const existing = s.tabs.find((t) => t.tabId === tab.tabId);
        if (existing) {
          return { ...s, activeTabId: tab.tabId };
        }
        return { ...s, tabs: [...s.tabs, tab], activeTabId: tab.tabId };
      });
    },

    removeTab: (tabId) => {
      set((s) => {
        const tabs = s.tabs.filter((t) => t.tabId !== tabId);
        const activeTabId =
          s.activeTabId === tabId ? (tabs[tabs.length - 1]?.tabId ?? null) : s.activeTabId;
        return { ...s, tabs, activeTabId };
      });
    },

    activateTab: (tabId) => {
      set((s) => ({ ...s, activeTabId: tabId }));
    },

    findJourneyTabByInstance: (instanceId) => {
      const { tabs } = get();
      return tabs.find((t) => t.kind === "journey" && t.instanceId === instanceId) ?? null;
    },
  }));

  store.subscribe((state) => persist(state));
  return store;
}
