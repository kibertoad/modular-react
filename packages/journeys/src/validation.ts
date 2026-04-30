import type { ModuleDescriptor } from "@modular-react/core";
import type { AnyJourneyDefinition, RegisteredJourney } from "./types.js";
import { parseRange, parseVersion, satisfiesParsed, SemverParseError } from "./semver.js";

/**
 * Aggregated error thrown when one or more registered journeys reference
 * module ids, entry names, or exit names that do not exist (or that
 * disagree on `allowBack`). Mirrors the style of core's
 * `validateDependencies` — accumulate all issues, throw once.
 */
export class JourneyValidationError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`[@modular-react/journeys] Invalid journey registration:\n  - ${issues.join("\n  - ")}`);
    this.name = "JourneyValidationError";
    this.issues = issues;
  }
}

export class JourneyHydrationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`[@modular-react/journeys] ${message}`, options);
    this.name = "JourneyHydrationError";
  }
}

/**
 * Thrown when `runtime.start()` / `runtime.hydrate()` is called with a
 * journey id that is not registered. Distinct class so shells can
 * discriminate "this journey is gone after an upgrade, drop the tab"
 * from transient or validation failures.
 */
export class UnknownJourneyError extends Error {
  readonly journeyId: string;
  constructor(journeyId: string, registered: readonly string[]) {
    super(
      `[@modular-react/journeys] Unknown journey id "${journeyId}". Registered: ${
        registered.join(", ") || "(none)"
      }`,
    );
    this.name = "UnknownJourneyError";
    this.journeyId = journeyId;
  }
}

export function validateJourneyContracts(
  journeys: readonly RegisteredJourney[],
  modules: readonly ModuleDescriptor<any, any, any, any>[],
): void {
  const issues: string[] = [];
  const moduleById = new Map<string, ModuleDescriptor<any, any, any, any>>();
  for (const mod of modules) moduleById.set(mod.id, mod);

  // Run the dependency-graph cycle check first — its issues read more
  // diagnostically when the graph is sane structurally, so emit them
  // alongside any structural problems below.
  for (const issue of detectInvokeGraphIssues(journeys)) issues.push(issue);

  // Guard against a module declaring an exit literally named `allowBack`.
  // Per-entry transitions on a journey use `allowBack: boolean` as a
  // control key and an exit of the same name would be silently skipped by
  // the per-exit iteration below. Fail loudly at registration time instead.
  for (const mod of modules) {
    if (mod.exitPoints && Object.prototype.hasOwnProperty.call(mod.exitPoints, "allowBack")) {
      issues.push(
        `module "${mod.id}" declares an exit named "allowBack", which collides with the reserved ` +
          `per-entry transition control key. Rename the exit (e.g. "allowBackExit").`,
      );
    }
  }

  const seenIds = new Set<string>();
  for (const reg of journeys) {
    const def = reg.definition;
    if (seenIds.has(def.id)) {
      issues.push(`journey "${def.id}" is registered more than once`);
    }
    seenIds.add(def.id);

    // Validate transitions map. The inner objects must be non-null — we
    // accept `AnyJourneyDefinition`, so a caller that sidesteps the typed
    // `defineJourney` helper can hand us `{ transitions: { foo: null } }`
    // or `{ bar: { baz: null } }`; we want those to become an accumulated
    // issue instead of a TypeError that short-circuits the loop.
    const transitions = (def.transitions ?? {}) as Record<string, unknown>;
    for (const [moduleId, perModule] of Object.entries(transitions)) {
      const mod = moduleById.get(moduleId);
      if (!mod) {
        issues.push(
          `journey "${def.id}" references unknown module id "${moduleId}" in transitions`,
        );
        continue;
      }
      if (!perModule || typeof perModule !== "object") {
        issues.push(
          `journey "${def.id}" has malformed transitions for module "${moduleId}" (expected an object)`,
        );
        continue;
      }
      for (const [entryName, perEntry] of Object.entries(perModule as Record<string, unknown>)) {
        const entry = mod.entryPoints?.[entryName];
        if (!entry) {
          issues.push(`journey "${def.id}" references unknown entry "${moduleId}.${entryName}"`);
          continue;
        }
        if (!perEntry || typeof perEntry !== "object") {
          issues.push(
            `journey "${def.id}" has malformed transitions for entry "${moduleId}.${entryName}" (expected an object)`,
          );
          continue;
        }
        const perEntryObj = perEntry as Record<string, unknown>;
        for (const exitName of Object.keys(perEntryObj)) {
          if (exitName === "allowBack") continue;
          if (!mod.exitPoints || !(exitName in mod.exitPoints)) {
            issues.push(
              `journey "${def.id}" references unknown exit "${moduleId}.${entryName}.${exitName}"`,
            );
          }
        }
        if (perEntryObj.allowBack === true) {
          const descriptorAllowBack = entry.allowBack;
          if (descriptorAllowBack !== "preserve-state" && descriptorAllowBack !== "rollback") {
            issues.push(
              `journey "${def.id}" sets allowBack on "${moduleId}.${entryName}" but the module entry does not declare allowBack`,
            );
          }
        }
      }
    }

    // Validate `moduleCompat`: each declared range must parse, the named
    // module must be registered, and the registered module's `version`
    // must satisfy the range. We accumulate every issue (rather than
    // throwing on the first) so a deployment with several mismatched
    // teams sees the full list in one CI run.
    if (def.moduleCompat) {
      for (const [moduleId, rangeRaw] of Object.entries(def.moduleCompat)) {
        if (typeof rangeRaw !== "string") {
          issues.push(
            `journey "${def.id}" declares a non-string version range for module "${moduleId}" in moduleCompat`,
          );
          continue;
        }
        // Trim and check separately from the typeof guard so a whitespace-only
        // value (e.g. `"   "`) gets a message that matches the actual problem,
        // and so it can't slip past length===0 and then be treated as the
        // wildcard range by `parseRange` (which would silently disable compat
        // enforcement for that module).
        const rangeNormalized = rangeRaw.trim();
        if (rangeNormalized.length === 0) {
          issues.push(
            `journey "${def.id}" declares an empty version range for module "${moduleId}" in moduleCompat`,
          );
          continue;
        }
        const mod = moduleById.get(moduleId);
        if (!mod) {
          issues.push(
            `journey "${def.id}" requires module "${moduleId}" (range "${rangeNormalized}") in moduleCompat but it is not registered`,
          );
          continue;
        }
        let parsedRange;
        try {
          parsedRange = parseRange(rangeNormalized);
        } catch (err) {
          const message = err instanceof SemverParseError ? err.message : String(err);
          issues.push(
            `journey "${def.id}" has an unparseable moduleCompat range for "${moduleId}": ${message}`,
          );
          continue;
        }
        let modVersion;
        try {
          modVersion = parseVersion(mod.version);
        } catch (err) {
          const message = err instanceof SemverParseError ? err.message : String(err);
          issues.push(
            `module "${moduleId}" declares an unparseable version "${mod.version}" (referenced by journey "${def.id}"): ${message}`,
          );
          continue;
        }
        if (!satisfiesParsed(modVersion, parsedRange)) {
          issues.push(
            `journey "${def.id}" requires module "${moduleId}" "${rangeNormalized}" but registered version is "${mod.version}"`,
          );
        }
      }
    }

    // Validate the sibling `resumes` map. Like `transitions`, the runtime
    // tolerates a malformed value (handlers are looked up by name at child
    // terminal time), but spelling errors at authoring time are easier to
    // diagnose here than as a generic "invoke-unknown-resume" abort.
    const resumes = (def.resumes ?? {}) as Record<string, unknown>;
    for (const [moduleId, perModule] of Object.entries(resumes)) {
      const mod = moduleById.get(moduleId);
      if (!mod) {
        issues.push(`journey "${def.id}" references unknown module id "${moduleId}" in resumes`);
        continue;
      }
      if (!perModule || typeof perModule !== "object") {
        issues.push(
          `journey "${def.id}" has malformed resumes for module "${moduleId}" (expected an object)`,
        );
        continue;
      }
      for (const [entryName, perEntry] of Object.entries(perModule as Record<string, unknown>)) {
        if (!mod.entryPoints?.[entryName]) {
          issues.push(
            `journey "${def.id}" references unknown entry "${moduleId}.${entryName}" in resumes`,
          );
          continue;
        }
        if (!perEntry || typeof perEntry !== "object") {
          issues.push(
            `journey "${def.id}" has malformed resumes for entry "${moduleId}.${entryName}" (expected an object)`,
          );
          continue;
        }
        // Resume names live in their own keyspace, but a name that collides
        // with a module exit on the same entry is almost certainly an error
        // (the author probably meant a transition handler, not a resume).
        // Surface it loudly.
        for (const resumeName of Object.keys(perEntry as Record<string, unknown>)) {
          if (mod.exitPoints && Object.prototype.hasOwnProperty.call(mod.exitPoints, resumeName)) {
            issues.push(
              `journey "${def.id}" declares resume "${moduleId}.${entryName}.${resumeName}" but "${resumeName}" is also an exit name on that module — rename one to avoid silent confusion`,
            );
          }
          const handler = (perEntry as Record<string, unknown>)[resumeName];
          if (typeof handler !== "function") {
            issues.push(
              `journey "${def.id}" has non-function resume "${moduleId}.${entryName}.${resumeName}"`,
            );
          }
        }
      }
    }
  }

  if (issues.length > 0) throw new JourneyValidationError(issues);
}

/**
 * Verify the directed graph of journey-to-journey invocations, derived
 * from each registered journey's `invokes` declaration, contains no
 * cycles. A cycle in the static graph would, at runtime, manifest as
 * either an infinite chain (depth-limited by `maxCallStackDepth`) or a
 * same-id-on-stack abort — both are recoverable but late. The graph
 * check turns the same mistake into a registration-time error citing
 * the cycle path.
 *
 * Run automatically as part of {@link validateJourneyContracts}. Exposed
 * separately so shells that compose registrations (e.g. plugin chaining)
 * can run the graph check on a partial slice without invoking the full
 * contracts validator. Throws {@link JourneyValidationError} when one or
 * more cycles are detected.
 *
 * **What's checked.** The graph only spans journeys whose `invokes`
 * field is declared as an array. Edges to journey ids that are not
 * present in `journeys` are ignored — those will fail at runtime with
 * `invoke-unknown-journey`, not as cycle reports. Self-loops (a journey
 * that lists its own handle) are reported as a one-cycle.
 *
 * **What's NOT checked.** Journeys that omit `invokes` contribute no
 * edges; a cycle that runs through such a journey will not be caught
 * statically, and the runtime guards (`invoke-cycle`,
 * `invoke-stack-overflow`) remain the safety net. Authors who want
 * full static coverage should declare `invokes` on every journey that
 * uses `invoke()`.
 */
export function validateJourneyGraph(journeys: readonly RegisteredJourney[]): void {
  const issues = detectInvokeGraphIssues(journeys);
  if (issues.length > 0) throw new JourneyValidationError(issues);
}

/**
 * DFS-based cycle finder over the static `invokes` graph. Returns one
 * issue per *distinct* cycle (canonicalized by rotating the cycle so
 * its lexicographically smallest id leads, so `A→B→A` and `B→A→B`
 * collapse to one report).
 *
 * Worst-case O(V + E) per starting node, V*E total — perfectly fine for
 * the tens-of-journeys scale this targets. We deliberately do not use
 * Tarjan's SCC algorithm here: enumerating an SCC's members is less
 * actionable to authors than a concrete cycle path, and DFS path
 * extraction gives that for free.
 */
function detectInvokeGraphIssues(journeys: readonly RegisteredJourney[]): string[] {
  const idSet = new Set<string>();
  for (const reg of journeys) idSet.add(reg.definition.id);

  const graph = new Map<string, string[]>();
  for (const reg of journeys) {
    const out: string[] = [];
    const declared = reg.definition.invokes;
    if (Array.isArray(declared)) {
      for (const handle of declared) {
        if (!handle || typeof handle.id !== "string") continue;
        // Edges to journeys outside the registration set are ignored —
        // their absence is reported by other paths (UnknownJourneyError
        // at runtime, or the registry's own missing-id check). The
        // cycle search only operates on the closed graph.
        if (!idSet.has(handle.id)) continue;
        out.push(handle.id);
      }
    }
    graph.set(reg.definition.id, out);
  }

  const issues: string[] = [];
  const reportedCycles = new Set<string>();
  // `fullyExplored` short-circuits nodes whose subtree we've already fully
  // explored. Once a node's subtree is known cycle-free (in either of two
  // senses: no cycles found, or all cycles through it already reported),
  // we skip it on subsequent DFS roots. The path-membership state
  // (`onPath`) is recomputed from each root.
  const fullyExplored = new Set<string>();
  const onPath = new Set<string>();
  const path: string[] = [];

  // Iterative DFS — a recursive version is more obvious to read but
  // overflows V8's stack on pathologically deep invoke chains (~10k
  // nodes deep). The iterative form preserves the same observable
  // behaviour: a frame is `{ id, nextIndex }` (a cursor over the node's
  // outgoing edges), which is exactly the state the recursive version
  // kept implicitly between recursive calls.
  type Frame = { readonly id: string; nextIndex: number };
  const stack: Frame[] = [];

  for (const reg of journeys) {
    const rootId = reg.definition.id;
    if (fullyExplored.has(rootId)) continue;

    stack.push({ id: rootId, nextIndex: 0 });
    onPath.add(rootId);
    path.push(rootId);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const neighbors = graph.get(frame.id);
      if (!neighbors || frame.nextIndex >= neighbors.length) {
        stack.pop();
        path.pop();
        onPath.delete(frame.id);
        fullyExplored.add(frame.id);
        continue;
      }
      const next = neighbors[frame.nextIndex]!;
      frame.nextIndex++;

      if (onPath.has(next)) {
        // Closed a cycle — extract the path from `next`'s first
        // occurrence through to the duplicate. e.g. for path [A, B, C]
        // re-entering A, the cycle is A → B → C → A.
        const startIdx = path.indexOf(next);
        const cycleNodes = path.slice(startIdx);
        const canonical = canonicalizeCycle(cycleNodes);
        if (!reportedCycles.has(canonical)) {
          reportedCycles.add(canonical);
          const display = [...cycleNodes, next].map(quote).join(" → ");
          issues.push(`journey invoke cycle detected: ${display}`);
        }
        continue;
      }
      if (fullyExplored.has(next)) continue;

      stack.push({ id: next, nextIndex: 0 });
      onPath.add(next);
      path.push(next);
    }
  }
  return issues;
}

function canonicalizeCycle(nodes: readonly string[]): string {
  // Rotate so the lexicographically smallest id leads. Without this,
  // the same cycle reported from two DFS roots would yield two distinct
  // strings (e.g. `A→B→A` vs `B→A→B`) and slip past the dedup Set.
  let pivot = 0;
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i] < nodes[pivot]) pivot = i;
  }
  return nodes.slice(pivot).concat(nodes.slice(0, pivot)).join("→");
}

function quote(id: string): string {
  return `"${id}"`;
}

/**
 * Shallow sanity check on a journey definition's own shape. Use this for
 * authoring ergonomics; structural contract checks live in
 * {@link validateJourneyContracts}.
 */
export function validateJourneyDefinition(def: AnyJourneyDefinition): readonly string[] {
  const issues: string[] = [];
  if (!def.id || typeof def.id !== "string") issues.push("journey is missing a string id");
  if (!def.version || typeof def.version !== "string")
    issues.push(`journey "${def.id ?? "(unknown)"}" is missing a string version`);
  if (typeof def.initialState !== "function")
    issues.push(`journey "${def.id}" must declare initialState as a function`);
  if (typeof def.start !== "function")
    issues.push(`journey "${def.id}" must declare start as a function`);
  if (!def.transitions || typeof def.transitions !== "object")
    issues.push(`journey "${def.id}" must declare transitions`);
  return issues;
}
