/**
 * Benchmark for the local semver subset. Run with `pnpm bench` from this
 * package, or `pnpm vitest bench bench/semver.bench.ts` directly.
 *
 * Two scenarios:
 *
 *   1. **One-shot.** Each iteration parses the range *and* the version, then
 *      checks satisfaction. This is the closest match to the runtime
 *      compatibility check itself (which runs once per (journey × module)
 *      pair at registration).
 *
 *   2. **Cached parse.** The range is parsed once outside the hot loop and
 *      reused. This isolates raw satisfaction cost from parser cost — useful
 *      when comparing a candidate refactor of `satisfiesParsed` against the
 *      baseline below.
 *
 * Historic comparison vs the `semver` package
 * -------------------------------------------
 * The local subset was originally validated against the npm `semver` package
 * — both for behaviour (a fixture grid that asserted bit-identical
 * `satisfies` results across the supported syntax) and for performance.
 * Captured on **`semver@7.7.4`**, Node 22, Windows, full RANGES × VERSIONS
 * grid per iteration:
 *
 *     name                                       hz (ops/s)   summary
 *     · ours                                       40,607      1.67× faster
 *     · semver package                             24,310
 *     · ours (parsed range, parsed version)     1,304,134      5.24× faster
 *     · semver Range + SemVer objects             249,010
 *
 * Local subset won ~1.7× on one-shot and ~5× on the cached path. We have
 * since dropped the `semver` devDependency to keep the journeys package
 * self-contained — the cross-check served its purpose at the time. If you
 * suspect a regression vs `semver` (behaviour or perf), reinstate
 * `semver@^7.7.4` as a devDependency and resurrect the comparison cases —
 * the structure below is a drop-in starting point.
 *
 * Caveat: that comparison was **not** like-for-like in correctness terms —
 * `semver` handles the full spec (prerelease tags, build metadata, hyphen
 * edge cases, loose mode); ours covers only the subset that matters for
 * module compat. Inputs outside the supported subset throw
 * {@link SemverParseError} synchronously rather than silently mismatching.
 */

import { bench, describe } from "vitest";
import { parseRange, parseVersion, satisfies, satisfiesParsed } from "../src/semver.js";

const RANGES = ["^1.2.3", "~1.2.3", ">=1.0.0 <2.0.0", "1.x", "^1.0.0 || ^2.0.0", "1.2.3 - 2.0.0"];

const VERSIONS = ["0.5.0", "1.0.0", "1.2.3", "1.5.7", "1.99.99", "2.0.0", "2.5.0", "3.0.0"];

describe("one-shot satisfies (parse + check each call)", () => {
  bench("ours", () => {
    for (const r of RANGES) {
      for (const v of VERSIONS) {
        satisfies(v, r);
      }
    }
  });
});

describe("cached parse (range parsed once, reused)", () => {
  const oursParsed = RANGES.map((r) => parseRange(r));
  const oursVersions = VERSIONS.map((v) => parseVersion(v));

  bench("ours (parsed range, parsed version)", () => {
    for (const r of oursParsed) {
      for (const v of oursVersions) {
        satisfiesParsed(v, r);
      }
    }
  });
});
