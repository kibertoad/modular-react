import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { ModulesContext, useModules, getModuleMeta } from "./modules-context.js";
import type { ModuleEntry } from "@modular-react/core";

describe("useModules", () => {
  it("returns modules from context", () => {
    const modules: ModuleEntry[] = [
      { id: "billing", version: "1.0.0", meta: { category: "finance" } },
    ];
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ModulesContext value={modules}>{children}</ModulesContext>
    );

    const { result } = renderHook(() => useModules(), { wrapper });
    expect(result.current).toBe(modules);
  });

  it("throws outside provider", () => {
    expect(() => renderHook(() => useModules())).toThrow(/useModules/);
  });
});

describe("getModuleMeta", () => {
  it("returns typed metadata", () => {
    interface JourneyMeta {
      name: string;
      category: string;
    }
    const entry: ModuleEntry = {
      id: "billing",
      version: "1.0.0",
      meta: { name: "Billing", category: "finance" },
    };

    const meta = getModuleMeta<JourneyMeta>(entry);
    expect(meta?.name).toBe("Billing");
    expect(meta?.category).toBe("finance");
  });

  it("returns undefined when no meta", () => {
    const entry: ModuleEntry = { id: "x", version: "1.0.0" };
    expect(getModuleMeta(entry)).toBeUndefined();
  });
});
