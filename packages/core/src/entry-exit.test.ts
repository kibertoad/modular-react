import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, schema, validateModuleEntryExit } from "./entry-exit.js";
import { validateEntryExitShape } from "./validation.js";
import type { ModuleDescriptor, ModuleEntryProps } from "./types.js";

// Minimal stand-in for a React component (the framework never calls it here).
const DummyComponent = (_props: ModuleEntryProps<unknown, any>): null => null;

describe("schema", () => {
  it("returns an empty object (runtime-null brand)", () => {
    const s = schema<{ foo: string }>();
    expect(s).toEqual({});
  });
});

describe("defineEntry", () => {
  it("returns its argument unchanged", () => {
    const entry = { component: DummyComponent, input: schema<{ id: string }>() };
    expect(defineEntry(entry)).toBe(entry);
  });

  it("preserves allowBack values", () => {
    const entry = defineEntry({
      component: DummyComponent,
      allowBack: "rollback" as const,
    });
    expect(entry.allowBack).toBe("rollback");
  });
});

describe("defineExit", () => {
  it("returns an empty schema when called with no args", () => {
    expect(defineExit()).toEqual({});
  });

  it("preserves explicit schema objects", () => {
    const s = defineExit<{ ok: boolean }>();
    expect(s).toEqual({});
  });
});

describe("validateModuleEntryExit", () => {
  function mod(overrides: Partial<ModuleDescriptor>): ModuleDescriptor {
    return { id: "m", version: "1.0.0", ...overrides };
  }

  it("returns no issues when entry/exit are absent", () => {
    expect(validateModuleEntryExit(mod({}))).toEqual([]);
  });

  it("returns no issues for well-formed entries and exits", () => {
    const m = mod({
      entryPoints: {
        review: { component: DummyComponent, allowBack: "preserve-state" },
      },
      exitPoints: { done: {} },
    });
    expect(validateModuleEntryExit(m)).toEqual([]);
  });

  it("flags a non-function component", () => {
    const m = mod({
      entryPoints: { broken: { component: "not-a-component" as any } },
    });
    const issues = validateModuleEntryExit(m);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/broken.*React component/);
  });

  it("flags an invalid allowBack value", () => {
    const m = mod({
      entryPoints: {
        bad: { component: DummyComponent, allowBack: "nope" as any },
      },
    });
    const issues = validateModuleEntryExit(m);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/allowBack/);
  });
});

describe("validateEntryExitShape", () => {
  it("passes for modules without entry/exit", () => {
    expect(() => validateEntryExitShape([{ id: "a", version: "1.0.0" }])).not.toThrow();
  });

  it("aggregates issues across modules", () => {
    const modules: ModuleDescriptor[] = [
      {
        id: "a",
        version: "1.0.0",
        entryPoints: { x: { component: "bad" as any } },
      },
      {
        id: "b",
        version: "1.0.0",
        entryPoints: { y: { component: DummyComponent, allowBack: "sideways" as any } },
      },
    ];
    expect(() => validateEntryExitShape(modules)).toThrow(/module "a".*module "b"/s);
  });
});
