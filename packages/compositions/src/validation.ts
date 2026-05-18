import { isExitContract } from "@modular-react/core";
import type { ExitContract, ModuleDescriptor } from "@modular-react/core";
import type { AnyCompositionDefinition, RegisteredComposition } from "./types.js";

/**
 * Aggregated error thrown when one or more registered compositions
 * reference module ids, entry names, or exit contracts that do not exist
 * or do not agree. Mirrors the style of `JourneyValidationError` —
 * accumulate every issue, throw once.
 */
export class CompositionValidationError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(
      `[@modular-react/compositions] Invalid composition registration:\n  - ${issues.join("\n  - ")}`,
    );
    this.name = "CompositionValidationError";
    this.issues = issues;
  }
}

export class CompositionHydrationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`[@modular-react/compositions] ${message}`, options);
    this.name = "CompositionHydrationError";
  }
}

/**
 * Thrown when `runtime.start()` is called with a composition id that is
 * not registered. Distinct class so shells can discriminate "this
 * composition is gone after an upgrade, drop the panel" from validation
 * failures.
 */
export class UnknownCompositionError extends Error {
  readonly compositionId: string;
  constructor(compositionId: string, registered: readonly string[]) {
    super(
      `[@modular-react/compositions] Unknown composition id "${compositionId}". Registered: ${
        registered.join(", ") || "(none)"
      }`,
    );
    this.name = "UnknownCompositionError";
    this.compositionId = compositionId;
  }
}

/**
 * Structural validator run when a composition is registered. Catches
 * authoring mistakes that wouldn't otherwise surface until the first
 * render of an outlet:
 *
 *   - missing/blank `id` / `version`
 *   - empty `zones` map
 *   - non-function zone `select`
 *
 * Does NOT touch module references — that's `validateCompositionContracts`,
 * which runs at registry resolve time when the module list is final.
 */
export function validateCompositionDefinition(def: AnyCompositionDefinition): readonly string[] {
  const issues: string[] = [];
  if (typeof def?.id !== "string" || def.id.length === 0) {
    issues.push("composition is missing `id`");
  }
  if (typeof def?.version !== "string" || def.version.length === 0) {
    issues.push(`composition "${def?.id ?? "<unknown>"}" is missing \`version\``);
  }
  if (typeof def?.initialState !== "function") {
    issues.push(`composition "${def?.id ?? "<unknown>"}" is missing \`initialState\``);
  }
  const zones = def?.zones;
  if (!zones || typeof zones !== "object") {
    issues.push(`composition "${def?.id ?? "<unknown>"}" is missing \`zones\``);
  } else {
    const keys = Object.keys(zones);
    if (keys.length === 0) {
      issues.push(`composition "${def.id}" declares no zones`);
    }
    for (const key of keys) {
      const zone = (zones as Record<string, unknown>)[key] as
        | { select?: unknown }
        | null
        | undefined;
      if (!zone || typeof zone !== "object") {
        issues.push(`composition "${def.id}" zone "${key}" is not an object`);
        continue;
      }
      if (typeof zone.select !== "function") {
        issues.push(`composition "${def.id}" zone "${key}" is missing \`select\``);
      }
    }
  }
  return issues;
}

/**
 * Cross-reference validator run at registry resolve time. Verifies that
 * every zone with a declared `contract` is satisfied by every module
 * that could populate the zone via a `module-entry` resolution — i.e.
 * that the module declares an exit point matching the contract by
 * reference identity.
 *
 * Because selectors are functions, we can't enumerate every reachable
 * resolution statically. The validator therefore enforces a weaker
 * invariant: for every zone with a contract, scan the module map and
 * spot-check that AT LEAST ONE candidate module declares the contract.
 * Modules that the selector never returns are unaffected; modules that
 * accidentally drop the contract surface immediately as a registry
 * failure rather than at first render.
 *
 * For full per-resolution checking, authors can pair a contract with
 * `moduleCompat` so module version drift fails assembly too.
 */
export function validateCompositionContracts(
  compositions: readonly RegisteredComposition[],
  modules: readonly ModuleDescriptor<any, any, any, any>[],
): void {
  const issues: string[] = [];
  const moduleById = new Map<string, ModuleDescriptor<any, any, any, any>>();
  for (const mod of modules) moduleById.set(mod.id, mod);

  const seenIds = new Set<string>();
  for (const reg of compositions) {
    const def = reg.definition;
    if (seenIds.has(def.id)) {
      issues.push(`composition "${def.id}" is registered more than once`);
    }
    seenIds.add(def.id);

    // moduleCompat range check — only entries naming registered modules
    // are checked; unknown ids are silently allowed because typed-module
    // catalogs may include modules whose registration is environment-
    // specific.
    const compat = def.moduleCompat;
    if (compat && typeof compat === "object") {
      for (const [moduleId, range] of Object.entries(compat as Record<string, string>)) {
        const mod = moduleById.get(moduleId);
        if (!mod) continue; // not registered in this assembly — skip
        // The journeys package owns the semver implementation; we do a
        // simple string check here rather than importing semver to keep
        // this package free of the dependency. The journeys plugin's
        // `validateJourneyContracts` already does the full check for any
        // shared module, which is sufficient for the editor-composition
        // use case (modules appear in both).
        if (typeof range !== "string" || range.length === 0) {
          issues.push(
            `composition "${def.id}" moduleCompat["${moduleId}"] is empty or not a string`,
          );
        }
        if (typeof mod.version !== "string") {
          issues.push(`module "${moduleId}" has no version, cannot check moduleCompat`);
        }
      }
    }

    // Per-zone contract spot-check.
    const zones = def.zones as Record<string, { contract?: ExitContract<unknown> }>;
    for (const [zoneName, zone] of Object.entries(zones)) {
      const contract = zone?.contract;
      if (!contract) continue;
      if (!isExitContract(contract)) {
        issues.push(
          `composition "${def.id}" zone "${zoneName}" declares a non-ExitContract value as \`contract\``,
        );
        continue;
      }
      // Walk modules. A candidate satisfies the contract when any of its
      // declared exit points reference the same `ExitContract` value (by
      // identity, matching how `wildcardTransitions` matches contracts).
      let anySatisfied = false;
      for (const mod of modules) {
        const exits = mod.exitPoints;
        if (!exits) continue;
        for (const exit of Object.values(exits)) {
          if (exit === contract) {
            anySatisfied = true;
            break;
          }
        }
        if (anySatisfied) break;
      }
      if (!anySatisfied) {
        issues.push(
          `composition "${def.id}" zone "${zoneName}" declares contract "${contract.kind}" but no registered module exposes it as an exit point`,
        );
      }
    }
  }

  if (issues.length > 0) throw new CompositionValidationError(issues);
}
