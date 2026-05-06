import { Suspense } from "react";
import type { ReactElement } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  EagerModuleEntryPoint,
  ExitPointMap,
  LazyModuleEntryPoint,
  ModuleEntryProps,
} from "@modular-react/core";

import { preloadEntry, resolveEntryComponent } from "./resolve-entry.js";

const REACT_LAZY_TYPE = Symbol.for("react.lazy");

function Eager(_props: ModuleEntryProps<{ value: string }, ExitPointMap>): ReactElement {
  return <span data-testid="eager">eager</span>;
}

function Lazy(_props: ModuleEntryProps<{ value: string }, ExitPointMap>): ReactElement {
  return <span data-testid="lazy">lazy</span>;
}

afterEach(() => {
  cleanup();
});

describe("resolveEntryComponent — eager", () => {
  it("returns the original component verbatim", () => {
    const entry: EagerModuleEntryPoint<{ value: string }> = { component: Eager };
    const { Component } = resolveEntryComponent(entry);
    expect(Component).toBe(Eager);
  });

  it("preload() is a resolved promise (no-op)", async () => {
    const entry: EagerModuleEntryPoint<{ value: string }> = { component: Eager };
    await expect(resolveEntryComponent(entry).preload()).resolves.toBeUndefined();
  });

  it("memoizes per entry-object identity", () => {
    const entry: EagerModuleEntryPoint<{ value: string }> = { component: Eager };
    expect(resolveEntryComponent(entry)).toBe(resolveEntryComponent(entry));
  });
});

describe("resolveEntryComponent — lazy", () => {
  it("Component is a React.lazy exotic", () => {
    const entry: LazyModuleEntryPoint<{ value: string }> = {
      lazy: () => Promise.resolve({ default: Lazy }),
    };
    const { Component } = resolveEntryComponent(entry);
    expect((Component as unknown as { $$typeof: symbol }).$$typeof).toBe(REACT_LAZY_TYPE);
  });

  it("preload() invokes the importer exactly once across N calls", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: Lazy }));
    const entry: LazyModuleEntryPoint<{ value: string }> = { lazy: importer };
    const { preload } = resolveEntryComponent(entry);
    await Promise.all([preload(), preload(), preload()]);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("preloadEntry() is equivalent to resolveEntryComponent(...).preload()", async () => {
    const importer = vi.fn(() => Promise.resolve({ default: Lazy }));
    const entry: LazyModuleEntryPoint<{ value: string }> = { lazy: importer };
    await preloadEntry(entry);
    await preloadEntry(entry);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("normalizes a module that exports the component directly (no `default`)", async () => {
    const entry: LazyModuleEntryPoint<{ value: string }> = {
      // Importer resolves to the component itself, not `{ default: ... }`.
      lazy: () => Promise.resolve(Lazy as unknown as { default: typeof Lazy }),
    };
    const { Component } = resolveEntryComponent(entry);
    let result: ReturnType<typeof render> | undefined;
    await act(async () => {
      result = render(
        <Suspense fallback={<span data-testid="fallback">loading</span>}>
          <Component input={{ value: "x" }} exit={(() => undefined) as never} goBack={undefined} />
        </Suspense>,
      );
    });
    await waitFor(() => {
      expect(result?.getByTestId("lazy")).toBeTruthy();
    });
  });

  it("renders the fallback then the resolved component", async () => {
    let resolveImport!: (mod: { default: typeof Lazy }) => void;
    const entry: LazyModuleEntryPoint<{ value: string }> = {
      lazy: () =>
        new Promise<{ default: typeof Lazy }>((res) => {
          resolveImport = res;
        }),
    };
    const { Component } = resolveEntryComponent(entry);
    const { getByTestId } = render(
      <Suspense fallback={<span data-testid="fallback">loading</span>}>
        <Component input={{ value: "x" }} exit={(() => undefined) as never} goBack={undefined} />
      </Suspense>,
    );
    // Suspense renders the fallback while the import is pending.
    expect(getByTestId("fallback")).toBeTruthy();
    await act(async () => {
      resolveImport({ default: Lazy });
      // Allow the lazy promise + React commit to settle.
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(getByTestId("lazy")).toBeTruthy();
    });
  });

  it("memoizes per entry-object identity (cached lazy wrapper)", () => {
    const entry: LazyModuleEntryPoint<{ value: string }> = {
      lazy: () => Promise.resolve({ default: Lazy }),
    };
    expect(resolveEntryComponent(entry)).toBe(resolveEntryComponent(entry));
  });
});

describe("resolveEntryComponent — invalid input", () => {
  it("throws when the entry declares neither component nor lazy", () => {
    expect(() => resolveEntryComponent({} as unknown as EagerModuleEntryPoint<unknown>)).toThrow(
      /neither `component` nor `lazy`/,
    );
  });

  it("traps a sync-throwing importer as a cached rejected promise", async () => {
    const failure = new Error("module is broken");
    const importer = vi.fn(() => {
      throw failure;
    });
    const entry: LazyModuleEntryPoint<{ value: string }> = { lazy: importer };
    const { preload } = resolveEntryComponent(entry);
    // First call traps the throw and stores a rejected promise.
    await expect(preload()).rejects.toBe(failure);
    // Second call replays the cached rejection — importer is NOT re-invoked.
    await expect(preload()).rejects.toBe(failure);
    expect(importer).toHaveBeenCalledTimes(1);
  });
});
