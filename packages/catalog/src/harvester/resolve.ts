import type { ResolverStyle } from "../config/types.js";
import { isJourneyDefinition, isModuleDescriptor } from "./detect.js";

/**
 * Run the configured resolver against a loaded module's namespace and
 * return every descriptor-shaped value it surfaces. Detection is duck-typed,
 * so a resolver may legitimately return non-descriptors — the caller filters
 * them out.
 */
export function applyResolver(
  resolver: ResolverStyle | undefined,
  mod: Record<string, unknown>,
  filePath: string,
): unknown[] {
  const style = resolver ?? "defaultExport";

  if (style === "defaultExport") {
    return mod.default !== undefined ? [mod.default] : [];
  }

  if (style === "namedExport") {
    // Plain "namedExport" without an exportName picks the first non-default
    // export that quacks like a descriptor — useful when a barrel exports
    // exactly one descriptor under any name.
    const candidates = Object.entries(mod)
      .filter(([key]) => key !== "default")
      .map(([, value]) => value);
    return candidates.filter((c) => isModuleDescriptor(c) || isJourneyDefinition(c));
  }

  if (style === "objectMap") {
    // The default export is an object whose values are descriptors.
    if (mod.default !== undefined && isObject(mod.default)) {
      return Object.values(mod.default);
    }
    // Fall back to treating *every* non-default export as a candidate.
    return Object.entries(mod)
      .filter(([key]) => key !== "default")
      .map(([, value]) => value);
  }

  if (typeof style === "object") {
    if (style.kind === "namedExport") {
      const value = mod[style.exportName];
      return value !== undefined ? [value] : [];
    }
    if (style.kind === "custom") {
      return style.select(mod, filePath);
    }
  }

  return [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
