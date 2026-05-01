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
    const safeUrl = toSafeTabUrl(tab.url);
    if (!safeUrl) {
      return <p className="text-sm text-muted-foreground">Extension URL was blocked.</p>;
    }
    return (
      <iframe
        src={safeUrl}
        title={tab.label}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        className="h-[60vh] w-full rounded border"
      />
    );
  }
  if (tab.html) {
    const html = sanitizeExtensionHtml(tab.html);
    return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return null;
}

function toSafeTabUrl(raw: string): string | null {
  try {
    const url = new URL(raw, window.location.href);
    if (url.origin === window.location.origin || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function sanitizeExtensionHtml(raw: string): string {
  const template = document.createElement("template");
  template.innerHTML = raw;
  for (const el of template.content.querySelectorAll("*")) {
    const tag = el.tagName.toLowerCase();
    if (["script", "iframe", "object", "embed", "link", "meta", "base", "form"].includes(tag)) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (
        name.startsWith("on") ||
        name === "srcdoc" ||
        value.toLowerCase().startsWith("javascript:")
      ) {
        el.removeAttribute(attr.name);
        continue;
      }
      if ((name === "href" || name === "src") && !isSafeResourceUrl(value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return template.innerHTML;
}

function isSafeResourceUrl(raw: string): boolean {
  try {
    const url = new URL(raw, window.location.href);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}
