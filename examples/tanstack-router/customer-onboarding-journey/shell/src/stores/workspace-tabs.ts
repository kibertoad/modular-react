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
  readonly updateTab: (tabId: string, patch: Partial<Tab>) => void;
  readonly activateTab: (tabId: string | null) => void;
  readonly findJourneyTabByInstance: (instanceId: string) => Tab | null;
}

const STORAGE_KEY = "workspace-tabs";

function isValidTab(value: unknown): value is Tab {
  if (typeof value !== "object" || value === null) return false;
  const t = value as { tabId?: unknown; kind?: unknown; title?: unknown };
  if (typeof t.tabId !== "string" || typeof t.title !== "string") return false;
  if (t.kind === "journey") {
    const jt = value as { journeyId?: unknown; instanceId?: unknown };
    return typeof jt.journeyId === "string" && typeof jt.instanceId === "string";
  }
  if (t.kind === "module") {
    const mt = value as { moduleId?: unknown };
    return typeof mt.moduleId === "string";
  }
  return false;
}

function loadInitial(): Pick<WorkspaceTabsState, "tabs" | "activeTabId"> {
  if (typeof localStorage === "undefined") {
    return { tabs: [], activeTabId: null };
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { tabs: [], activeTabId: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return { tabs: [], activeTabId: null };
    }
    const { tabs, activeTabId } = parsed as {
      tabs?: unknown;
      activeTabId?: unknown;
    };
    const safeTabs = Array.isArray(tabs) ? tabs.filter(isValidTab) : [];
    const safeActiveTabId =
      typeof activeTabId === "string" && safeTabs.some((t) => t.tabId === activeTabId)
        ? activeTabId
        : null;
    return { tabs: safeTabs, activeTabId: safeActiveTabId };
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

    updateTab: (tabId, patch) => {
      set((s) => ({
        ...s,
        tabs: s.tabs.map((t) => (t.tabId === tabId ? ({ ...t, ...patch } as Tab) : t)),
      }));
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
