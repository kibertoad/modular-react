import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CatalogModel, CatalogTheme } from "./types";

interface CatalogContextValue {
  model: CatalogModel;
  theme: CatalogTheme;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState<CatalogModel | null>(null);
  const [theme, setTheme] = useState<CatalogTheme | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(new URL("../catalog.json", import.meta.url).toString()).then((r) => {
        if (!r.ok) throw new Error(`catalog.json: ${r.status}`);
        return r.json() as Promise<CatalogModel>;
      }),
      fetch(new URL("../theme.json", import.meta.url).toString())
        .then((r) => (r.ok ? (r.json() as Promise<CatalogTheme>) : ({} as CatalogTheme)))
        .catch(() => ({}) as CatalogTheme),
    ])
      .then(([m, t]) => {
        if (cancelled) return;
        setModel(m);
        setTheme(t);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message ?? String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<CatalogContextValue | null>(
    () => (model && theme ? { model, theme } : null),
    [model, theme],
  );

  if (error) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Failed to load catalog</h1>
        <p className="text-red-600 font-mono text-sm">{error}</p>
        <p className="mt-4 text-gray-600">
          The SPA expects <code>catalog.json</code> in the same directory. Run{" "}
          <code>modular-react-catalog build</code> to produce it.
        </p>
      </div>
    );
  }
  if (!value) {
    return <div className="p-8 text-gray-500">Loading catalog…</div>;
  }
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextValue {
  const v = useContext(CatalogContext);
  if (!v) throw new Error("useCatalog called outside CatalogProvider");
  return v;
}
