import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { defineJourney } from "./define-journey.js";
import {
  JourneyValidationError,
  validateJourneyContracts,
  validateJourneyDefinition,
} from "./validation.js";

const exits = { ok: defineExit(), cancel: defineExit() } as const;
const mod = defineModule({
  id: "m",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    start: defineEntry({
      component: (() => null) as any,
      input: schema<void>(),
      allowBack: "preserve-state",
    }),
  },
});
type Modules = { readonly m: typeof mod };

const base = defineJourney<Modules, {}>()({
  id: "j",
  version: "1.0.0",
  initialState: () => ({}),
  start: () => ({ module: "m", entry: "start", input: undefined }),
  transitions: {
    m: {
      start: {
        allowBack: true,
        ok: () => ({ complete: null }),
        cancel: () => ({ abort: { reason: "c" } }),
      },
    },
  },
});

describe("validateJourneyContracts", () => {
  it("passes when all references resolve", () => {
    expect(() =>
      validateJourneyContracts([{ definition: base, options: undefined }], [mod]),
    ).not.toThrow();
  });

  it("reports duplicate journey ids", () => {
    expect(() =>
      validateJourneyContracts(
        [
          { definition: base, options: undefined },
          { definition: base, options: undefined },
        ],
        [mod],
      ),
    ).toThrow(JourneyValidationError);
  });

  it("reports unknown module id", () => {
    const bad = { ...base, id: "bad" } as typeof base;
    expect(() =>
      validateJourneyContracts(
        [
          {
            definition: {
              ...bad,
              transitions: { ghost: { start: { ok: () => ({ abort: null }) } } } as any,
            },
            options: undefined,
          },
        ],
        [mod],
      ),
    ).toThrow(/unknown module id "ghost"/);
  });

  it("reports unknown entry and exit names", () => {
    expect(() =>
      validateJourneyContracts(
        [
          {
            definition: {
              ...base,
              id: "other",
              transitions: { m: { missing: { ok: () => ({ abort: null }) } } as any },
            } as typeof base,
            options: undefined,
          },
        ],
        [mod],
      ),
    ).toThrow(/unknown entry "m\.missing"/);

    expect(() =>
      validateJourneyContracts(
        [
          {
            definition: {
              ...base,
              id: "e",
              transitions: { m: { start: { ghost: () => ({ abort: null }) } } as any },
            } as typeof base,
            options: undefined,
          },
        ],
        [mod],
      ),
    ).toThrow(/unknown exit "m\.start\.ghost"/);
  });

  it("reports a module that declares an exit literally named 'allowBack'", () => {
    const clashingExits = { allowBack: defineExit() } as const;
    const clashingMod = defineModule({
      id: "clash",
      version: "1.0.0",
      exitPoints: clashingExits,
      entryPoints: {
        start: defineEntry({ component: (() => null) as any, input: schema<void>() }),
      },
    });
    expect(() => validateJourneyContracts([], [clashingMod])).toThrow(
      /declares an exit named "allowBack"/,
    );
  });

  it("reports allowBack mismatch between journey and module entry", () => {
    const entryNoBack = {
      ...mod,
      entryPoints: {
        start: defineEntry({ component: (() => null) as any, input: schema<void>() }),
      },
    };
    expect(() =>
      validateJourneyContracts([{ definition: base, options: undefined }], [entryNoBack]),
    ).toThrow(/allowBack/);
  });
});

describe("validateJourneyDefinition", () => {
  it("returns no issues for a well-formed definition", () => {
    expect(validateJourneyDefinition(base)).toEqual([]);
  });

  it("reports missing required fields", () => {
    const bad = { ...base, id: "", initialState: undefined as any };
    const issues = validateJourneyDefinition(bad as any);
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });
});
