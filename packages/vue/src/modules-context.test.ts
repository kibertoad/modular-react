import { describe, it, expect } from "vitest";
import type { ModuleEntry } from "@modular-frontend/core";
import { getModuleMeta, modulesKey, useModules } from "./modules-context.js";
import { renderComposable } from "./test-render.js";

describe("useModules", () => {
  it("returns modules from context", () => {
    const modules: ModuleEntry[] = [
      { id: "billing", version: "1.0.0", meta: { category: "finance" } },
    ];
    const { result } = renderComposable(() => useModules(), {
      provide: { [modulesKey as symbol]: modules },
    });
    expect(result()).toBe(modules);
  });

  it("throws outside provider", () => {
    expect(() => renderComposable(() => useModules())).toThrow(/useModules/);
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
