/**
 * Naive benchmark comparing the local semver subset against the `semver`
 * package. Run with `pnpm vitest bench src/semver.bench.ts`.
 *
 * The numbers below are reproducible on a typical workstation; the relative
 * ordering is the point, not the absolute throughput. Two scenarios:
 *
 *   1. **One-shot.** Each iteration parses the range *and* the version, then
 *      checks satisfaction. This is how a naive caller would use either
 *      library and is the closest match to the runtime compatibility check
 *      (which runs once per (journey × module) pair at registration).
 *
 *   2. **Cached parse.** The range is parsed once outside the hot loop and
 *      reused. This is what the production validator does for repeated
 *      checks against the same range; it isolates raw satisfaction cost
 *      from parser cost.
 *
 * Sample run on Node 22 (Windows, full RANGES × VERSIONS grid per iteration):
 *
 *     name                                       hz (ops/s)   summary
 *     · ours                                       40,607      1.67× faster
 *     · semver package                             24,310
 *     · ours (parsed range, parsed version)     1,304,134      5.24× faster
 *     · semver Range + SemVer objects             249,010
 *
 * Local subset wins ~1.7× on one-shot and ~5× on the cached path. Caveat: this
 * is **not** a like-for-like correctness comparison — `semver` handles the
 * full spec (prerelease tags, build metadata, hyphen edge cases, loose
 * mode); ours covers only the subset that matters for module compat. The
 * benchmark is here so anyone who suspects the local impl has regressed
 * can confirm or refute the suspicion in seconds.
 */

import { bench, describe } from "vitest";
import semver from "semver";
import { parseRange, parseVersion, satisfies, satisfiesParsed } from "./semver.js";

const RANGES = [
  "^1.2.3",
  "~1.2.3",
  ">=1.0.0 <2.0.0",
  "1.x",
  "^1.0.0 || ^2.0.0",
  "1.2.3 - 2.0.0",
];

const VERSIONS = ["0.5.0", "1.0.0", "1.2.3", "1.5.7", "1.99.99", "2.0.0", "2.5.0", "3.0.0"];

describe("one-shot satisfies (parse + check each call)", () => {
  bench("ours", () => {
    for (const r of RANGES) {
      for (const v of VERSIONS) {
        satisfies(v, r);
      }
    }
  });

  bench("semver package", () => {
    for (const r of RANGES) {
      for (const v of VERSIONS) {
        semver.satisfies(v, r);
      }
    }
  });
});

describe("cached parse (range parsed once, reused)", () => {
  const oursParsed = RANGES.map((r) => parseRange(r));
  const oursVersions = VERSIONS.map((v) => parseVersion(v));
  const theirsRanges = RANGES.map((r) => new semver.Range(r));
  const theirsVersions = VERSIONS.map((v) => new semver.SemVer(v));

  bench("ours (parsed range, parsed version)", () => {
    for (const r of oursParsed) {
      for (const v of oursVersions) {
        satisfiesParsed(v, r);
      }
    }
  });

  bench("semver Range + SemVer objects", () => {
    for (const r of theirsRanges) {
      for (const v of theirsVersions) {
        r.test(v);
      }
    }
  });
});
