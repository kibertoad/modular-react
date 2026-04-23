import type { ModuleDescriptor } from "@modular-react/core";
import type { AnyJourneyDefinition, RegisteredJourney } from "./types.js";

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

export function validateJourneyContracts(
  journeys: readonly RegisteredJourney[],
  modules: readonly ModuleDescriptor<any, any, any, any>[],
): void {
  const issues: string[] = [];
  const moduleById = new Map<string, ModuleDescriptor<any, any, any, any>>();
  for (const mod of modules) moduleById.set(mod.id, mod);

  const seenIds = new Set<string>();
  for (const reg of journeys) {
    const def = reg.definition;
    if (seenIds.has(def.id)) {
      issues.push(`journey "${def.id}" is registered more than once`);
    }
    seenIds.add(def.id);

    // Validate transitions map
    const transitions = (def.transitions ?? {}) as Record<string, Record<string, any>>;
    for (const [moduleId, perModule] of Object.entries(transitions)) {
      const mod = moduleById.get(moduleId);
      if (!mod) {
        issues.push(
          `journey "${def.id}" references unknown module id "${moduleId}" in transitions`,
        );
        continue;
      }
      for (const [entryName, perEntry] of Object.entries(perModule)) {
        const entry = mod.entryPoints?.[entryName];
        if (!entry) {
          issues.push(`journey "${def.id}" references unknown entry "${moduleId}.${entryName}"`);
          continue;
        }
        for (const exitName of Object.keys(perEntry)) {
          if (exitName === "allowBack") continue;
          if (!mod.exitPoints || !(exitName in mod.exitPoints)) {
            issues.push(
              `journey "${def.id}" references unknown exit "${moduleId}.${entryName}.${exitName}"`,
            );
          }
        }
        if (perEntry.allowBack === true) {
          const descriptorAllowBack = entry.allowBack;
          if (descriptorAllowBack !== "preserve-state" && descriptorAllowBack !== "rollback") {
            issues.push(
              `journey "${def.id}" sets allowBack on "${moduleId}.${entryName}" but the module entry does not declare allowBack`,
            );
          }
        }
      }
    }
  }

  if (issues.length > 0) throw new JourneyValidationError(issues);
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
