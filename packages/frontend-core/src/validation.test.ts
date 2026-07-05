import { describe, it, expect, vi } from "vitest";
import { validateNoDuplicateIds, validateDependencies } from "./validation.js";
import type { ModuleDescriptor, LazyModuleDescriptor } from "./types.js";

function mod(id: string, overrides?: Partial<ModuleDescriptor>): ModuleDescriptor {
  return { id, version: "1.0.0", ...overrides };
}

function lazyMod(id: string): LazyModuleDescriptor {
  return { id, basePath: `/${id}`, load: async () => ({ default: mod(id) }) };
}

describe("validateNoDuplicateIds", () => {
  it("passes for unique IDs", () => {
    expect(() => validateNoDuplicateIds([mod("a"), mod("b")], [])).not.toThrow();
  });

  it("throws for duplicate eager module IDs", () => {
    expect(() => validateNoDuplicateIds([mod("a"), mod("a")], [])).toThrow(
      /Duplicate module ID "a"/,
    );
  });

  it("throws for duplicate across eager and lazy modules", () => {
    expect(() => validateNoDuplicateIds([mod("a")], [lazyMod("a")])).toThrow(
      /Duplicate module ID "a"/,
    );
  });
});

describe("validateDependencies", () => {
  it("passes when all required deps are available", () => {
    const m = mod("test", { requires: ["auth", "http"] });
    expect(() => validateDependencies([m], new Set(["auth", "http"]))).not.toThrow();
  });

  it("throws when required deps are missing", () => {
    const m = mod("test", { requires: ["auth", "missing"] });
    expect(() => validateDependencies([m], new Set(["auth"]))).toThrow(/missing/);
  });

  it("warns for missing optional deps but does not throw", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = mod("test", { optionalRequires: ["analytics"] });

    expect(() => validateDependencies([m], new Set())).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("analytics"));

    warnSpy.mockRestore();
  });
});
