import { reactive, watch } from "vue";

export interface JourneyTab {
  readonly tabId: string;
  readonly kind: "journey";
  readonly title: string;
  readonly journeyId: string;
  readonly input: unknown;
  readonly instanceId: string;
}

// This focused example renders exclusively via journey tabs; a richer shell
// would add a `ModuleTab` variant here (see the React example's tab strip).
export type Tab = JourneyTab;

export interface WorkspaceTabsState {
  readonly tabs: readonly Tab[];
  readonly activeTabId: string | null;
}

export interface WorkspaceTabsStore {
  /** Reactive state — read `store.state.tabs` / `store.state.activeTabId` in components. */
  readonly state: WorkspaceTabsState;
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
  if (t.kind !== "journey") return false;
  const jt = value as { journeyId?: unknown; instanceId?: unknown };
  return typeof jt.journeyId === "string" && typeof jt.instanceId === "string";
}

function loadInitial(): WorkspaceTabsState {
  if (typeof localStorage === "undefined") return { tabs: [], activeTabId: null };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { tabs: [], activeTabId: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return { tabs: [], activeTabId: null };
    const { tabs, activeTabId } = parsed as { tabs?: unknown; activeTabId?: unknown };
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

function persist(state: WorkspaceTabsState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ tabs: state.tabs, activeTabId: state.activeTabId }),
  );
}

export function createWorkspaceTabsStore(): WorkspaceTabsStore {
  const initial = loadInitial();
  const state = reactive<{ tabs: Tab[]; activeTabId: string | null }>({
    tabs: [...initial.tabs],
    activeTabId: initial.activeTabId,
  });

  // Persist on every change — the Vue analog of the React store's
  // `store.subscribe(persist)`. `flush: "sync"` keeps localStorage in step with
  // the mutation so a reload immediately after a click restores the same state.
  watch(
    () => ({ tabs: state.tabs, activeTabId: state.activeTabId }),
    (s) => persist(s),
    { deep: true, flush: "sync" },
  );

  return {
    state,
    addTab(tab) {
      const existing = state.tabs.find((t) => t.tabId === tab.tabId);
      if (existing) {
        state.activeTabId = tab.tabId;
        return;
      }
      state.tabs.push(tab);
      state.activeTabId = tab.tabId;
    },
    removeTab(tabId) {
      state.tabs = state.tabs.filter((t) => t.tabId !== tabId);
      if (state.activeTabId === tabId) {
        state.activeTabId = state.tabs[state.tabs.length - 1]?.tabId ?? null;
      }
    },
    updateTab(tabId, patch) {
      state.tabs = state.tabs.map((t) => (t.tabId === tabId ? ({ ...t, ...patch } as Tab) : t));
    },
    activateTab(tabId) {
      state.activeTabId = tabId;
    },
    findJourneyTabByInstance(instanceId) {
      return state.tabs.find((t) => t.instanceId === instanceId) ?? null;
    },
  };
}
