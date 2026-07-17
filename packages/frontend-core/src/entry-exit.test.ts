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

  it("accepts a lazy importer in place of a component", () => {
    const importer = (): Promise<{ default: typeof DummyComponent }> =>
      Promise.resolve({ default: DummyComponent });
    const entry = defineEntry({
      lazy: importer,
      input: schema<{ id: string }>(),
    });
    expect(entry.lazy).toBe(importer);
    expect((entry as { component?: unknown }).component).toBeUndefined();
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

  it("flags an entry that has neither component nor lazy", () => {
    const m = mod({
      entryPoints: { broken: { component: "not-a-component" as any } },
    });
    const issues = validateModuleEntryExit(m);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(
      /broken.*component \(function or component object\) or a lazy importer/,
    );
  });

  it("accepts an object component (Vue SFC / defineComponent, React memo/forwardRef)", () => {
    const m = mod({
      // SFCs and `defineComponent(...)` compile to a plain options object, not
      // a function — the neutral validator must accept that shape.
      entryPoints: { review: { component: { name: "ReviewProfile", render: () => null } } as any },
    });
    expect(validateModuleEntryExit(m)).toEqual([]);
  });

  it("flags an entry whose component is an array", () => {
    const m = mod({
      entryPoints: { broken: { component: [] as any } },
    });
    const issues = validateModuleEntryExit(m);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(
      /broken.*component \(function or component object\) or a lazy importer/,
    );
  });

  it("accepts an entry with only a lazy importer", () => {
    const importer = (): Promise<{ default: typeof DummyComponent }> =>
      Promise.resolve({ default: DummyComponent });
    const m = mod({
      entryPoints: { ok: { lazy: importer } as any },
    });
    expect(validateModuleEntryExit(m)).toEqual([]);
  });

  it("flags an entry that declares both component and lazy", () => {
    const importer = (): Promise<{ default: typeof DummyComponent }> =>
      Promise.resolve({ default: DummyComponent });
    const m = mod({
      entryPoints: {
        both: { component: DummyComponent, lazy: importer } as any,
      },
    });
    const issues = validateModuleEntryExit(m);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/both.*mutually exclusive/);
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
