import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ResolvedExtensionTab } from "../types";

const OVERVIEW_TAB_ID = "__overview";

/**
 * Detail-page tab strip. The first tab ("Overview") shows the built-in
 * detail content. Each `ResolvedExtensionTab` produces an additional tab —
 * `url` tabs render in a sandboxed iframe; `html` tabs are inlined verbatim.
 *
 * If `tabs` is empty, this just renders `overview` directly without any tab UI
 * to avoid wasted vertical space.
 */
export function DetailTabs({
  overview,
  tabs,
}: {
  overview: ReactNode;
  tabs: readonly ResolvedExtensionTab[];
}) {
  if (tabs.length === 0) return <>{overview}</>;

  return (
    <Tabs defaultValue={OVERVIEW_TAB_ID}>
      <TabsList variant="line" className="mb-4">
        <TabsTrigger value={OVERVIEW_TAB_ID}>Overview</TabsTrigger>
        {tabs.map((t) => (
          <TabsTrigger key={t.id} value={t.id}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={OVERVIEW_TAB_ID}>{overview}</TabsContent>
      {tabs.map((t) => (
        <TabsContent key={t.id} value={t.id}>
          <ExtensionTabBody tab={t} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function ExtensionTabBody({ tab }: { tab: ResolvedExtensionTab }) {
  if (tab.url) {
    return (
      <iframe
        src={tab.url}
        title={tab.label}
        // Default sandbox: scripts + same-origin only. Hosts that need broader
        // capabilities should resolve to a URL on a hardened path that
        // serves its own embed-safe page.
        sandbox="allow-scripts allow-same-origin"
        className="h-[60vh] w-full rounded border"
      />
    );
  }
  if (tab.html) {
    // SAFETY: this HTML originates from the host's catalog config, which is
    // trusted (it ran the rest of the build). The catalog itself is a static
    // artifact; the host owns both ends.
    return (
      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: tab.html }} />
    );
  }
  return null;
}
