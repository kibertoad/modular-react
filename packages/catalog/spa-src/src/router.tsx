import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { useCatalog } from "./catalog-context";
import { ModulesListView } from "./views/ModulesListView";
import { ModuleDetailView } from "./views/ModuleDetailView";
import { JourneysListView } from "./views/JourneysListView";
import { JourneyDetailView } from "./views/JourneyDetailView";
import { DomainPivotView, TagPivotView, TeamPivotView } from "./views/PivotView";
import { CommandPalette, openCommandPalette } from "./components/CommandPalette";
import { cn } from "@/lib/utils";

/**
 * Search-param shape on the list routes. Built-in keys are typed; custom
 * facet selections ride along under the `c.<key>` namespace and are passed
 * through verbatim (the router doesn't know which facet keys exist —
 * extensions are configured per-build).
 */
export interface ListSearch {
  query?: string;
  team?: string;
  domain?: string;
  status?: string;
  tag?: string;
  [key: string]: string | undefined;
}

function parseListSearch(input: Record<string, unknown>): ListSearch {
  const out: ListSearch = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/modules" });
  },
});

export const modulesIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/modules",
  validateSearch: parseListSearch,
  component: ModulesListView,
});

export const moduleDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/modules/$id",
  component: ModuleDetailView,
});

export const journeysIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/journeys",
  validateSearch: parseListSearch,
  component: JourneysListView,
});

export const journeyDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/journeys/$id",
  component: JourneyDetailView,
});

export const teamPivotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/teams/$team",
  component: TeamPivotView,
});

export const domainPivotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/domains/$domain",
  component: DomainPivotView,
});

export const tagPivotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tags/$tag",
  component: TagPivotView,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  modulesIndexRoute,
  moduleDetailRoute,
  journeysIndexRoute,
  journeyDetailRoute,
  teamPivotRoute,
  domainPivotRoute,
  tagPivotRoute,
]);

// Catalogs are usually opened by clicking through a hosted index — file:// shows
// up too (someone unzips the artifact and opens index.html). Memory history
// makes both work without a server-side rewrite.
const isFileProtocol = typeof window !== "undefined" && window.location.protocol === "file:";

export const router = createRouter({
  routeTree,
  history: isFileProtocol ? createMemoryHistory() : undefined,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function RootLayout() {
  const { model, theme } = useCatalog();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          {theme.logoUrl && <img src={theme.logoUrl} alt="" className="h-8 w-auto" />}
          <h1 className="text-xl font-bold">{theme.brandName ?? model.title}</h1>
          <CommandPaletteHint />
          <div className="text-xs text-muted-foreground">
            {model.modules.length} module{model.modules.length === 1 ? "" : "s"}
            {" · "}
            {model.journeys.length} journey
            {model.journeys.length === 1 ? "" : "s"}
            {" · "}
            built {new Date(model.builtAt).toLocaleString()}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        <nav className="mb-6 flex gap-2 border-b">
          <NavTab to="/modules">Modules ({model.modules.length})</NavTab>
          <NavTab to="/journeys">Journeys ({model.journeys.length})</NavTab>
        </nav>
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}

function CommandPaletteHint() {
  // Doubles as the click target for opening the palette — the keystroke and
  // the click both end up calling `openCommandPalette()`.
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-label="Open command palette"
      className="ml-auto hidden cursor-pointer items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex"
    >
      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">
        {isMac ? "⌘" : "Ctrl"} K
      </kbd>
      <span>to search</span>
    </button>
  );
}

function NavTab({ to, children }: { to: "/modules" | "/journeys"; children: React.ReactNode }) {
  const baseClass = "px-4 py-2 text-sm font-medium border-b-2 outline-none transition-colors";
  return (
    <Link
      to={to}
      activeOptions={{ includeSearch: false }}
      className={cn(baseClass, "border-transparent text-muted-foreground hover:text-foreground")}
      activeProps={{
        className: cn(baseClass, "border-[var(--catalog-primary)] text-foreground"),
      }}
    >
      {children}
    </Link>
  );
}
