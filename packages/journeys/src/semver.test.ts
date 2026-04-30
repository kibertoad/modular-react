import { describe, expect, it } from "vitest";
import {
  compareTriples,
  parseRange,
  parseVersion,
  satisfies,
  satisfiesParsed,
  SemverParseError,
} from "./semver.js";

describe("parseVersion", () => {
  it("parses MAJOR.MINOR.PATCH", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("0.0.0")).toEqual([0, 0, 0]);
    expect(parseVersion("10.20.30")).toEqual([10, 20, 30]);
  });

  it("strips a leading v prefix", () => {
    expect(parseVersion("v1.2.3")).toEqual([1, 2, 3]);
  });

  it("strips a leading = prefix (npm 'loose' trim)", () => {
    // The class doc on the file claims `Leading 'v'/'='` is tolerated; lock
    // that contract here so a future stripVersionPrefix refactor can't drop
    // the `=` arm without surfacing.
    expect(parseVersion("=1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("=1.2.3")).toEqual(parseVersion("1.2.3"));
  });

  it("strips only a single prefix character (doubled forms still fail)", () => {
    expect(() => parseVersion("==1.2.3")).toThrow(SemverParseError);
    expect(() => parseVersion("vv1.2.3")).toThrow(SemverParseError);
  });

  it("rejects prerelease and build metadata", () => {
    expect(() => parseVersion("1.0.0-rc.1")).toThrow(SemverParseError);
    expect(() => parseVersion("1.0.0+abc")).toThrow(SemverParseError);
  });

  it("rejects partials and garbage", () => {
    expect(() => parseVersion("1.2")).toThrow(SemverParseError);
    expect(() => parseVersion("foo")).toThrow(SemverParseError);
    expect(() => parseVersion("")).toThrow(SemverParseError);
  });
});

describe("compareTriples", () => {
  it("orders by major then minor then patch", () => {
    expect(compareTriples([1, 0, 0], [2, 0, 0])).toBe(-1);
    expect(compareTriples([1, 2, 0], [1, 1, 9])).toBe(1);
    expect(compareTriples([1, 2, 3], [1, 2, 4])).toBe(-1);
    expect(compareTriples([1, 2, 3], [1, 2, 3])).toBe(0);
  });
});

describe("satisfies — exact / wildcard", () => {
  it("matches exact versions", () => {
    expect(satisfies("1.2.3", "1.2.3")).toBe(true);
    expect(satisfies("1.2.3", "=1.2.3")).toBe(true);
    expect(satisfies("1.2.4", "1.2.3")).toBe(false);
  });

  it("treats * / x / empty as match-anything", () => {
    expect(satisfies("0.0.0", "*")).toBe(true);
    expect(satisfies("9.9.9", "x")).toBe(true);
    expect(satisfies("1.0.0", "")).toBe(true);
  });
});

describe("satisfies — caret", () => {
  it("caps at the next major when major > 0", () => {
    expect(satisfies("1.2.3", "^1.2.3")).toBe(true);
    expect(satisfies("1.2.4", "^1.2.3")).toBe(true);
    expect(satisfies("1.9.9", "^1.2.3")).toBe(true);
    expect(satisfies("2.0.0", "^1.2.3")).toBe(false);
    expect(satisfies("1.2.2", "^1.2.3")).toBe(false);
  });

  it("caps at the next minor when major === 0 and minor > 0", () => {
    expect(satisfies("0.2.3", "^0.2.3")).toBe(true);
    expect(satisfies("0.2.9", "^0.2.3")).toBe(true);
    expect(satisfies("0.3.0", "^0.2.3")).toBe(false);
    expect(satisfies("0.1.9", "^0.2.3")).toBe(false);
  });

  it("caps at the next patch when major === 0 and minor === 0", () => {
    expect(satisfies("0.0.3", "^0.0.3")).toBe(true);
    expect(satisfies("0.0.4", "^0.0.3")).toBe(false);
    expect(satisfies("0.0.2", "^0.0.3")).toBe(false);
  });

  it("expands ^1 / ^1.2 to the same window as the explicit form", () => {
    expect(satisfies("1.0.0", "^1")).toBe(true);
    expect(satisfies("1.99.99", "^1")).toBe(true);
    expect(satisfies("2.0.0", "^1")).toBe(false);

    expect(satisfies("1.2.0", "^1.2")).toBe(true);
    expect(satisfies("1.9.9", "^1.2")).toBe(true);
    expect(satisfies("1.1.0", "^1.2")).toBe(false);
    expect(satisfies("2.0.0", "^1.2")).toBe(false);
  });
});

describe("satisfies — tilde", () => {
  it("caps at the next minor for ~MAJOR.MINOR.PATCH", () => {
    expect(satisfies("1.2.3", "~1.2.3")).toBe(true);
    expect(satisfies("1.2.9", "~1.2.3")).toBe(true);
    expect(satisfies("1.3.0", "~1.2.3")).toBe(false);
    expect(satisfies("1.2.2", "~1.2.3")).toBe(false);
  });

  it("treats ~1 like ^1", () => {
    expect(satisfies("1.99.99", "~1")).toBe(true);
    expect(satisfies("2.0.0", "~1")).toBe(false);
  });
});

describe("satisfies — comparators", () => {
  it.each([
    [">=1.2.3", "1.2.3", true],
    [">=1.2.3", "1.2.2", false],
    [">1.2.3", "1.2.3", false],
    [">1.2.3", "1.2.4", true],
    ["<2.0.0", "1.99.99", true],
    ["<2.0.0", "2.0.0", false],
    ["<=2.0.0", "2.0.0", true],
  ])("range %s vs %s → %s", (range, version, expected) => {
    expect(satisfies(version, range)).toBe(expected);
  });

  it("ANDs comparators in a single group", () => {
    expect(satisfies("1.5.0", ">=1.0.0 <2.0.0")).toBe(true);
    expect(satisfies("2.0.0", ">=1.0.0 <2.0.0")).toBe(false);
  });

  it("ORs comparator groups separated by ||", () => {
    expect(satisfies("1.5.0", "^1.0.0 || ^2.0.0")).toBe(true);
    expect(satisfies("2.5.0", "^1.0.0 || ^2.0.0")).toBe(true);
    expect(satisfies("3.0.0", "^1.0.0 || ^2.0.0")).toBe(false);
  });
});

describe("satisfies — x ranges", () => {
  it("expands 1.x and 1.2.x", () => {
    expect(satisfies("1.0.0", "1.x")).toBe(true);
    expect(satisfies("1.99.99", "1.x")).toBe(true);
    expect(satisfies("2.0.0", "1.x")).toBe(false);
    expect(satisfies("1.2.99", "1.2.x")).toBe(true);
    expect(satisfies("1.3.0", "1.2.x")).toBe(false);
  });

  it("accepts uppercase X and the wildcard star", () => {
    expect(satisfies("1.5.5", "1.X.X")).toBe(true);
    expect(satisfies("1.5.5", "1.*.*")).toBe(true);
  });

  it("rejects partials with a wildcard before a concrete number", () => {
    expect(() => parseRange("1.x.2")).toThrow(SemverParseError);
  });
});

describe("satisfies — hyphen ranges", () => {
  it("expands `A - B` to >=A <=B with partial bumping", () => {
    expect(satisfies("1.2.3", "1.2.3 - 2.0.0")).toBe(true);
    expect(satisfies("2.0.0", "1.2.3 - 2.0.0")).toBe(true);
    expect(satisfies("2.0.1", "1.2.3 - 2.0.0")).toBe(false);
    expect(satisfies("1.2.2", "1.2.3 - 2.0.0")).toBe(false);

    // Partial upper: `1.2.3 - 2` → `>=1.2.3 <3.0.0`
    expect(satisfies("2.99.99", "1.2.3 - 2")).toBe(true);
    expect(satisfies("3.0.0", "1.2.3 - 2")).toBe(false);
  });
});

describe("parseRange + satisfiesParsed (cached parse)", () => {
  it("re-uses a parsed range for many checks", () => {
    const range = parseRange("^1.2.3 || ^2.0.0");
    expect(satisfiesParsed(parseVersion("1.5.0"), range)).toBe(true);
    expect(satisfiesParsed(parseVersion("2.0.0"), range)).toBe(true);
    expect(satisfiesParsed(parseVersion("3.0.0"), range)).toBe(false);
  });
});

describe("parser error messages name the offending input", () => {
  it("includes the original token in caret/tilde errors", () => {
    expect(() => parseRange("^abc")).toThrow(/invalid caret range "\^abc"/);
    expect(() => parseRange("~xyz")).toThrow(/invalid tilde range "~xyz"/);
  });

  it("rejects unknown leading characters with a versioned message", () => {
    expect(() => parseRange(">>1.0.0")).toThrow(SemverParseError);
  });
});

/**
 * Frozen behaviour grid recorded against `semver@7.7.4` at the time this
 * package's bespoke implementation was first written. Each row is
 * `[version, range, expectedOutcome]` where `expectedOutcome` is what
 * `semver.satisfies(version, range)` returned in that run. Re-asserting it
 * here lets us catch any regression in our own implementation without
 * shipping `semver` as a devDependency.
 *
 * If you ever extend the supported syntax, regenerate the table by
 * temporarily reinstalling `semver` and running the original cross-check —
 * see the comment at the top of `bench/semver.bench.ts` for the script.
 */
const SEMVER_FIXTURE_GRID: ReadonlyArray<readonly [string, string, boolean]> = [
  // version "1.2.3" — exact-match anchor row
  ["1.2.3", "1.2.3", true],
  ["1.2.3", "^1.2.3", true],
  ["1.2.3", "~1.2.3", true],
  ["1.2.3", ">=1.0.0 <2.0.0", true],
  ["1.2.3", "1.x", true],
  ["1.2.3", "1.2.x", true],
  ["1.2.3", "*", true],
  ["1.2.3", "^1.0.0 || ^2.0.0", true],
  ["1.2.3", "1.2.3 - 2.0.0", true],
  ["1.2.3", "^0.2.3", false],
  ["1.2.3", "^0.0.1", false],

  // major-bump boundary
  ["2.0.0", "^1.2.3", false],
  ["2.0.0", "~1.2.3", false],
  ["2.0.0", "1.x", false],
  ["2.0.0", "1.2.x", false],
  ["2.0.0", "1.2.3 - 2.0.0", true],
  ["2.0.0", ">=1.0.0 <2.0.0", false],
  ["2.0.0", "^1.0.0 || ^2.0.0", true],

  // 0.x caret semantics — collapses to next minor
  ["0.2.3", "^0.2.3", true],
  ["0.2.9", "^0.2.3", true],
  ["0.3.0", "^0.2.3", false],

  // 0.0.x caret semantics — collapses to exact patch
  ["0.0.1", "^0.0.1", true],
  ["0.0.1", "^0.2.3", false],

  // tilde
  ["1.2.4", "~1.2.3", true],
  ["1.9.9", "~1.2.3", false],
  ["1.2.4", "~1.2", true],

  // miscellaneous misses
  ["3.0.0", "^1.0.0 || ^2.0.0", false],
  ["1.9.9", "^1.2.3", true],
  ["1.9.9", "1.x", true],

  // tilde with partial — `~1.2` ≡ `>=1.2.0 <1.3.0`
  ["1.2.0", "~1.2", true],
  ["1.2.99", "~1.2", true],
  ["1.3.0", "~1.2", false],
  ["1.1.99", "~1.2", false],

  // v-prefixed comparator forms — npm semver tolerates the leading `v`
  ["1.5.0", ">=v1.2.3", true],
  ["1.0.0", ">=v1.2.3", false],
  ["1.5.0", ">=v1.2.3 <v2.0.0", true],
  ["2.0.0", ">=v1.2.3 <v2.0.0", false],

  // hyphen with partial bounds — `1.2.3 - 2` bumps the upper to <3.0.0
  ["2.99.99", "1.2.3 - 2", true],
  ["3.0.0", "1.2.3 - 2", false],
  ["1.2.2", "1.2.3 - 2", false],
  // partial *both* sides — `1 - 3` ≡ `>=1.0.0 <4.0.0`
  ["1.0.0", "1 - 3", true],
  ["3.99.99", "1 - 3", true],
  ["4.0.0", "1 - 3", false],
  ["0.99.99", "1 - 3", false],

  // three-group OR — proves the disjunction is n-ary, not just two-way
  ["1.5.0", "^1.0.0 || ^2.0.0 || ^3.0.0", true],
  ["3.5.0", "^1.0.0 || ^2.0.0 || ^3.0.0", true],
  ["4.0.0", "^1.0.0 || ^2.0.0 || ^3.0.0", false],

  // multi-comparator AND in a single conjunction
  ["1.4.0", ">1.2.3 <=1.5.0", true],
  ["1.5.0", ">1.2.3 <=1.5.0", true],
  ["1.5.1", ">1.2.3 <=1.5.0", false],
  ["1.2.3", ">1.2.3 <=1.5.0", false],

  // explicit equals
  ["1.2.3", "=1.2.3", true],
  ["1.2.4", "=1.2.3", false],

  // ^0.0.0 — npm semver collapses this to `>=0.0.0 <0.0.1` (matches 0.0.0
  // exactly), the boundary case where caret on all-zeros gives no slack
  ["0.0.0", "^0.0.0", true],
  ["0.0.1", "^0.0.0", false],
];

describe("frozen `semver@7.7.4` behaviour grid", () => {
  it.each(SEMVER_FIXTURE_GRID)("satisfies(%s, %s) === %s", (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected);
  });
});
