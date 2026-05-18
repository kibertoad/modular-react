import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineExitContract, defineModule, schema } from "@modular-react/core";
import { defineComposition } from "./define-composition.js";
import {
  CompositionValidationError,
  validateCompositionContracts,
  validateCompositionDefinition,
} from "./validation.js";
import type { RegisteredComposition } from "./types.js";

describe("validateCompositionDefinition", () => {
  it("flags missing id and version", () => {
    const issues = validateCompositionDefinition({} as never);
    expect(issues.join("\n")).toMatch(/missing `id`/);
    expect(issues.join("\n")).toMatch(/missing `version`/);
  });

  it("flags empty zones", () => {
    const issues = validateCompositionDefinition({
      id: "x",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {},
    } as never);
    expect(issues.join("\n")).toMatch(/declares no zones/);
  });

  it("flags non-function select", () => {
    const issues = validateCompositionDefinition({
      id: "x",
      version: "1.0.0",
      initialState: () => ({}),
      zones: { left: { select: "not a fn" } },
    } as never);
    expect(issues.join("\n")).toMatch(/missing `select`/);
  });

  it("passes for a well-formed definition", () => {
    const mod = defineModule({ id: "m", version: "1.0.0" });
    type Mods = { readonly m: typeof mod };
    const def = defineComposition<Mods, { x: number }>()({
      id: "ok",
      version: "1.0.0",
      initialState: () => ({ x: 0 }),
      zones: {
        left: { select: () => ({ kind: "empty" }) },
      },
    });
    expect(validateCompositionDefinition(def as never)).toEqual([]);
  });
});

describe("validateCompositionContracts", () => {
  it("rejects a zone contract not satisfied by any module", () => {
    const closeContract = defineExitContract<{ ok: boolean }>("close-clicked");
    const editor = defineModule({ id: "editor", version: "1.0.0", exitPoints: {} });
    const def = defineComposition<{ readonly editor: typeof editor }, {}>()({
      id: "comp",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        left: {
          select: () => ({ kind: "empty" }),
          contract: closeContract,
        },
      },
    });

    expect(() =>
      validateCompositionContracts(
        [{ definition: def as never, options: undefined } as RegisteredComposition],
        [editor],
      ),
    ).toThrow(CompositionValidationError);
  });

  it("accepts a zone contract satisfied by at least one module", () => {
    const closeContract = defineExitContract<{ ok: boolean }>("close-clicked");
    const contentful = defineModule({
      id: "contentful",
      version: "1.0.0",
      exitPoints: { close: closeContract },
    });
    const def = defineComposition<{ readonly contentful: typeof contentful }, {}>()({
      id: "comp",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        left: {
          select: () => ({ kind: "empty" }),
          contract: closeContract,
        },
      },
    });
    expect(() =>
      validateCompositionContracts(
        [{ definition: def as never, options: undefined } as RegisteredComposition],
        [contentful],
      ),
    ).not.toThrow();
  });

  it("rejects duplicate composition ids", () => {
    const def = defineComposition<{}, {}>()({
      id: "dup",
      version: "1.0.0",
      initialState: () => ({}),
      zones: { left: { select: () => ({ kind: "empty" }) } },
    });
    expect(() =>
      validateCompositionContracts(
        [
          { definition: def as never, options: undefined } as RegisteredComposition,
          { definition: def as never, options: undefined } as RegisteredComposition,
        ],
        [],
      ),
    ).toThrow(/registered more than once/);
  });
});
