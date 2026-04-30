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

describe("validateJourneyContracts — moduleCompat", () => {
  function withCompat(compat: Record<string, string>) {
    return { ...base, moduleCompat: compat } as typeof base & {
      readonly moduleCompat: Readonly<Record<string, string>>;
    };
  }

  it("passes when every declared range admits the registered module version", () => {
    expect(() =>
      validateJourneyContracts(
        [{ definition: withCompat({ m: "^1.0.0" }), options: undefined }],
        [mod],
      ),
    ).not.toThrow();
  });

  it("reports when the registered module version is outside the declared range", () => {
    expect(() =>
      validateJourneyContracts(
        [{ definition: withCompat({ m: "^2.0.0" }), options: undefined }],
        [mod],
      ),
    ).toThrow(/requires module "m" "\^2\.0\.0" but registered version is "1\.0\.0"/);
  });

  it("reports when a declared module is not registered", () => {
    expect(() =>
      validateJourneyContracts(
        [{ definition: withCompat({ ghost: "^1.0.0" }), options: undefined }],
        [mod],
      ),
    ).toThrow(/requires module "ghost" \(range "\^1\.0\.0"\)[\s\S]*not registered/);
  });

  it("reports an unparseable range with the original input echoed back", () => {
    expect(() =>
      validateJourneyContracts(
        [{ definition: withCompat({ m: "^abc" }), options: undefined }],
        [mod],
      ),
    ).toThrow(/unparseable moduleCompat range for "m"[\s\S]*\^abc/);
  });

  it("reports an unparseable module version", () => {
    const badVersionMod = { ...mod, version: "not.a.version" };
    expect(() =>
      validateJourneyContracts(
        [{ definition: withCompat({ m: "^1.0.0" }), options: undefined }],
        [badVersionMod],
      ),
    ).toThrow(/unparseable version "not\.a\.version"/);
  });

  it("rejects a non-string range value", () => {
    const def = { ...base, moduleCompat: { m: 1 as unknown as string } };
    expect(() =>
      validateJourneyContracts([{ definition: def as any, options: undefined }], [mod]),
    ).toThrow(/non-string version range for module "m"/);
  });

  it("rejects a whitespace-only range (does not silently match the wildcard)", () => {
    expect(() =>
      validateJourneyContracts(
        [{ definition: withCompat({ m: "   " }), options: undefined }],
        [mod],
      ),
    ).toThrow(/empty version range for module "m"/);
  });

  it("aggregates issues across multiple journeys and modules", () => {
    const j1 = { ...base, id: "j1", moduleCompat: { m: "^2.0.0" } };
    const j2 = { ...base, id: "j2", moduleCompat: { m: "^3.0.0" } };
    let captured: Error | null = null;
    try {
      validateJourneyContracts(
        [
          { definition: j1 as any, options: undefined },
          { definition: j2 as any, options: undefined },
        ],
        [mod],
      );
    } catch (e) {
      captured = e as Error;
    }
    expect(captured).toBeInstanceOf(JourneyValidationError);
    const issues = (captured as JourneyValidationError).issues;
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatch(/journey "j1"/);
    expect(issues[1]).toMatch(/journey "j2"/);
  });

  it("supports OR ranges", () => {
    const v2Mod = { ...mod, version: "2.5.0" };
    expect(() =>
      validateJourneyContracts(
        [{ definition: withCompat({ m: "^1.0.0 || ^2.0.0" }), options: undefined }],
        [v2Mod],
      ),
    ).not.toThrow();
  });
});
