/**
 * Minimal semver subset for module-compatibility checks.
 *
 * Why not the `semver` package?
 * -----------------------------
 * `semver` is the canonical JavaScript implementation of the full semver-2.0
 * specification: prerelease tags, build metadata, hyphen ranges, partial
 * versions, loose mode, range intersection algebra, etc. Two costs come with
 * that surface:
 *
 *   1. **Parse cost.** `new SemVer(v)` and `new Range(r)` allocate several
 *      objects per call — a `SemVer` for each comparator, regex matches over
 *      a hot path. For a startup-time validation that runs once per
 *      registered journey × module, the parse cost is fine; for long-running
 *      checks (test suites that resolve hundreds of manifests, hot-reload
 *      cycles in dev) it adds up.
 *   2. **Range expansion.** `^1.2.3` parses into a `Range` with two
 *      `Comparator` objects wrapping two `SemVer` objects; satisfaction is
 *      then checked by walking comparator sets. It works, but for the
 *      narrow set of ranges this codebase actually uses (caret/tilde/exact
 *      from `package.json` and authoring sugar on journey declarations) the
 *      math collapses into "is `[major, minor, patch]` in `[lo, hi)`?" — a
 *      handful of integer comparisons.
 *
 * What this implementation supports
 * ---------------------------------
 *   - exact:    `1.2.3`             (and `=1.2.3`)
 *   - caret:    `^1.2.3`, `^0.2.3`, `^0.0.3`
 *   - tilde:    `~1.2.3`, `~1.2`, `~1`
 *   - x-range:  `1.x`, `1.x.x`, `1.2.x`, `*`, `x`, `1`, `1.2`
 *   - bounded:  `>=1.2.3`, `>1.2.3`, `<1.2.3`, `<=1.2.3`, `=1.2.3`
 *   - hyphen:   `1.2.3 - 2.0.0`
 *   - AND:      whitespace-separated comparators (e.g. `>=1.0.0 <2.0.0`)
 *   - OR:       `||`-separated comparator sets
 *
 * What it does NOT support
 * ------------------------
 *   - prerelease tags (`1.0.0-rc.1`) — we treat anything past `MAJOR.MINOR.PATCH`
 *     as an error. Module versions in this framework are stable releases by
 *     contract; if that ever changes, we add prerelease handling here.
 *   - build metadata (`1.0.0+abc`) — same reasoning.
 *   - loose mode / version coercion — versions must be strict
 *     `MAJOR.MINOR.PATCH`.
 *
 * If a module declares a range or version this parser can't handle, the
 * relevant function throws a `SemverParseError` synchronously so the failure
 * shows up at registration time rather than as a silent "no match".
 */

/** Triple of integers — `[major, minor, patch]`. */
export type SemverTriple = readonly [number, number, number];

const enum Op {
  GT,
  GTE,
  LT,
  LTE,
  EQ,
}

interface Comparator {
  readonly op: Op;
  readonly v: SemverTriple;
}

/**
 * Pre-parsed range. A range is a disjunction (`||`) of conjunctions (` `).
 * Each conjunction is a list of comparators all of which must hold for the
 * version to match the conjunction; the range matches if any one
 * conjunction matches. The `*` / empty range parses to a single empty
 * conjunction (vacuously true).
 */
export interface ParsedRange {
  readonly sets: readonly (readonly Comparator[])[];
}

export class SemverParseError extends Error {
  constructor(message: string) {
    super(`[@modular-react/journeys] ${message}`);
    this.name = "SemverParseError";
  }
}

/**
 * Parse a strict `MAJOR.MINOR.PATCH` version. Leading `v`/`=` is tolerated
 * (matching `npm` and `semver`'s "loose" trim, which is universal in the
 * wild) but any prerelease/build suffix is rejected so a typo doesn't
 * silently match nothing.
 */
export function parseVersion(input: string): SemverTriple {
  const trimmed = stripVersionPrefix(input);
  const triple = parseTriple(trimmed);
  if (!triple) throw new SemverParseError(`invalid version "${input}"`);
  return triple;
}

/**
 * Parse a range string into a {@link ParsedRange}. Throws
 * {@link SemverParseError} on syntactically invalid input. Cache the result
 * when validating against the same range repeatedly — `satisfies` itself is
 * pure integer arithmetic but the parser walks the string.
 */
export function parseRange(input: string): ParsedRange {
  const raw = input.trim();
  if (raw === "" || raw === "*" || raw === "x" || raw === "X") {
    return { sets: [[]] };
  }
  const orParts = raw.split("||");
  const sets: Comparator[][] = [];
  for (const orPart of orParts) {
    const conj = parseConjunction(orPart);
    sets.push(conj);
  }
  return { sets };
}

/**
 * Test a concrete version against a parsed range. The hot path is a few
 * integer compares per comparator with no allocations.
 */
export function satisfiesParsed(version: SemverTriple, range: ParsedRange): boolean {
  for (const set of range.sets) {
    let ok = true;
    for (const cmp of set) {
      if (!checkComparator(version, cmp)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Convenience wrapper that parses both inputs and runs satisfaction. Use
 * this for one-shot checks; for hot loops, parse once and pass the cached
 * {@link ParsedRange} to {@link satisfiesParsed}.
 */
export function satisfies(version: string, range: string): boolean {
  return satisfiesParsed(parseVersion(version), parseRange(range));
}

/**
 * Compare two version triples lexicographically by `(major, minor, patch)`.
 * Returns -1 / 0 / 1.
 */
export function compareTriples(a: SemverTriple, b: SemverTriple): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  if (a[2] !== b[2]) return a[2] < b[2] ? -1 : 1;
  return 0;
}

// -----------------------------------------------------------------------------
// Internals
// -----------------------------------------------------------------------------

function checkComparator(v: SemverTriple, cmp: Comparator): boolean {
  const c = compareTriples(v, cmp.v);
  switch (cmp.op) {
    case Op.GT:
      return c > 0;
    case Op.GTE:
      return c >= 0;
    case Op.LT:
      return c < 0;
    case Op.LTE:
      return c <= 0;
    case Op.EQ:
      return c === 0;
  }
}

function parseConjunction(input: string): Comparator[] {
  const out: Comparator[] = [];
  // Detect hyphen ranges (`A - B`) before splitting on whitespace. We
  // require whitespace around the hyphen so `1.2.3-rc.1` (which we reject
  // anyway) and bare numerics in a partial don't collide.
  const hyphen = matchHyphenRange(input);
  if (hyphen) {
    expandHyphen(hyphen[0], hyphen[1], out);
    return out;
  }
  const tokens = input.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return out;
  for (const tok of tokens) expandToken(tok, out);
  return out;
}

function matchHyphenRange(input: string): [string, string] | null {
  // Pattern: <token> <whitespace> "-" <whitespace> <token>
  // We don't allow `1.2.3-2.0.0` (no whitespace) — it'd ambiguate with
  // prerelease syntax. Strict whitespace-padded form only.
  const m = input.match(/^\s*(\S+)\s+-\s+(\S+)\s*$/);
  if (!m) return null;
  return [m[1]!, m[2]!];
}

function expandHyphen(loRaw: string, hiRaw: string, out: Comparator[]): void {
  // Lower bound: partial → fill with zero. `1` → `>=1.0.0`; `1.2` → `>=1.2.0`.
  const loPartial = parsePartial(stripVersionPrefix(loRaw));
  if (!loPartial) throw new SemverParseError(`invalid lower bound in hyphen range "${loRaw}"`);
  out.push({ op: Op.GTE, v: fillPartial(loPartial, 0) });

  // Upper bound: partial → bump the most-specific declared component and
  // use `<` (so `1.2.3 - 2.0.0` becomes `<=2.0.0`, but `1.2.3 - 2` becomes
  // `<3.0.0`). This matches npm semver's hyphen semantics.
  const hiPartial = parsePartial(stripVersionPrefix(hiRaw));
  if (!hiPartial) throw new SemverParseError(`invalid upper bound in hyphen range "${hiRaw}"`);
  if (hiPartial.major === null)
    throw new SemverParseError(`invalid upper bound in hyphen range "${hiRaw}"`);
  if (hiPartial.minor === null) {
    out.push({ op: Op.LT, v: [hiPartial.major + 1, 0, 0] });
  } else if (hiPartial.patch === null) {
    out.push({ op: Op.LT, v: [hiPartial.major, hiPartial.minor + 1, 0] });
  } else {
    out.push({ op: Op.LTE, v: [hiPartial.major, hiPartial.minor, hiPartial.patch] });
  }
}

function expandToken(token: string, out: Comparator[]): void {
  if (token === "*" || token === "x" || token === "X") return; // no-op (vacuous)
  if (token.startsWith("^")) {
    expandCaret(token.slice(1), out);
    return;
  }
  if (token.startsWith("~")) {
    expandTilde(token.slice(1), out);
    return;
  }
  if (token.startsWith(">=")) {
    out.push({ op: Op.GTE, v: parseStrict(token.slice(2), token) });
    return;
  }
  if (token.startsWith("<=")) {
    out.push({ op: Op.LTE, v: parseStrict(token.slice(2), token) });
    return;
  }
  if (token.startsWith(">")) {
    out.push({ op: Op.GT, v: parseStrict(token.slice(1), token) });
    return;
  }
  if (token.startsWith("<")) {
    out.push({ op: Op.LT, v: parseStrict(token.slice(1), token) });
    return;
  }
  if (token.startsWith("=")) {
    expandPlainOrXRange(token.slice(1), token, out);
    return;
  }
  expandPlainOrXRange(token, token, out);
}

function expandCaret(rest: string, out: Comparator[]): void {
  const partial = parsePartial(stripVersionPrefix(rest));
  if (!partial) throw new SemverParseError(`invalid caret range "^${rest}"`);
  const { major, minor, patch } = partial;
  if (major === null) throw new SemverParseError(`invalid caret range "^${rest}"`);
  // `^1` / `^1.x` / `^1.2.x` all collapse to "any version with the same
  // most-significant non-zero component"; the runtime treatment is uniform
  // with the explicit forms above.
  if (major > 0) {
    out.push({ op: Op.GTE, v: [major, minor ?? 0, patch ?? 0] });
    out.push({ op: Op.LT, v: [major + 1, 0, 0] });
    return;
  }
  // major === 0: the next significant level becomes the cap.
  if (minor === null) {
    // `^0` → `>=0.0.0 <1.0.0` (matches `semver` behaviour)
    out.push({ op: Op.GTE, v: [0, 0, 0] });
    out.push({ op: Op.LT, v: [1, 0, 0] });
    return;
  }
  if (minor > 0) {
    out.push({ op: Op.GTE, v: [0, minor, patch ?? 0] });
    out.push({ op: Op.LT, v: [0, minor + 1, 0] });
    return;
  }
  // major === 0, minor === 0
  if (patch === null) {
    out.push({ op: Op.GTE, v: [0, 0, 0] });
    out.push({ op: Op.LT, v: [0, 1, 0] });
    return;
  }
  out.push({ op: Op.GTE, v: [0, 0, patch] });
  out.push({ op: Op.LT, v: [0, 0, patch + 1] });
}

function expandTilde(rest: string, out: Comparator[]): void {
  const partial = parsePartial(stripVersionPrefix(rest));
  if (!partial) throw new SemverParseError(`invalid tilde range "~${rest}"`);
  const { major, minor, patch } = partial;
  if (major === null) throw new SemverParseError(`invalid tilde range "~${rest}"`);
  if (minor === null) {
    // `~1` → `>=1.0.0 <2.0.0` (treat as caret on major).
    out.push({ op: Op.GTE, v: [major, 0, 0] });
    out.push({ op: Op.LT, v: [major + 1, 0, 0] });
    return;
  }
  out.push({ op: Op.GTE, v: [major, minor, patch ?? 0] });
  out.push({ op: Op.LT, v: [major, minor + 1, 0] });
}

function expandPlainOrXRange(rest: string, token: string, out: Comparator[]): void {
  const stripped = stripVersionPrefix(rest);
  const partial = parsePartial(stripped);
  if (!partial) throw new SemverParseError(`invalid version or range "${token}"`);
  const { major, minor, patch } = partial;
  if (major === null) return; // `*` / `x` already handled above; defensive.
  if (minor === null) {
    out.push({ op: Op.GTE, v: [major, 0, 0] });
    out.push({ op: Op.LT, v: [major + 1, 0, 0] });
    return;
  }
  if (patch === null) {
    out.push({ op: Op.GTE, v: [major, minor, 0] });
    out.push({ op: Op.LT, v: [major, minor + 1, 0] });
    return;
  }
  out.push({ op: Op.EQ, v: [major, minor, patch] });
}

interface PartialVersion {
  readonly major: number | null;
  readonly minor: number | null;
  readonly patch: number | null;
}

function parsePartial(s: string): PartialVersion | null {
  if (s === "" || s === "*" || s === "x" || s === "X") {
    return { major: null, minor: null, patch: null };
  }
  const parts = s.split(".");
  if (parts.length > 3) return null;
  const out: (number | null)[] = [];
  for (const part of parts) {
    if (part === "" || part === "x" || part === "X" || part === "*") {
      out.push(null);
      continue;
    }
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  while (out.length < 3) out.push(null);
  // Reject partials like `1.x.2` (a wildcard followed by a concrete number)
  // — this is malformed in semver and the silent "treat trailing as
  // wildcard" behaviour is more confusing than a clean error.
  let sawWildcard = false;
  for (const v of out) {
    if (v === null) sawWildcard = true;
    else if (sawWildcard) return null;
  }
  return { major: out[0]!, minor: out[1]!, patch: out[2]! };
}

function fillPartial(p: PartialVersion, fill: number): SemverTriple {
  return [p.major ?? fill, p.minor ?? fill, p.patch ?? fill];
}

function parseStrict(s: string, original: string): SemverTriple {
  const triple = parseTriple(stripVersionPrefix(s));
  if (!triple) throw new SemverParseError(`invalid version in "${original}"`);
  return triple;
}

function parseTriple(s: string): SemverTriple | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function stripVersionPrefix(s: string): string {
  let out = s.trim();
  if (out.startsWith("v") || out.startsWith("V")) out = out.slice(1);
  return out;
}
