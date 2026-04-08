import type { ReactiveModuleDescriptor, LazyModuleDescriptor } from "@react-router-modules/core";

export function validateNoDuplicateIds(
  modules: ReactiveModuleDescriptor[],
  lazyModules: LazyModuleDescriptor[],
): void {
  const ids = new Set<string>();
  for (const mod of modules) {
    if (ids.has(mod.id)) {
      throw new Error(
        `[@react-router-modules/runtime] Duplicate module ID "${mod.id}". Each module must have a unique ID.`,
      );
    }
    ids.add(mod.id);
  }
  for (const mod of lazyModules) {
    if (ids.has(mod.id)) {
      throw new Error(
        `[@react-router-modules/runtime] Duplicate module ID "${mod.id}". Each module must have a unique ID.`,
      );
    }
    ids.add(mod.id);
  }
}

export function validateDependencies(
  modules: ReactiveModuleDescriptor[],
  availableKeys: Set<string>,
): void {
  for (const mod of modules) {
    if (mod.requires) {
      const missing = mod.requires.filter((key) => !availableKeys.has(key as string));
      if (missing.length > 0) {
        throw new Error(
          `[@react-router-modules/runtime] Module "${mod.id}" requires dependencies not provided by the registry: ` +
            `${missing.map(String).join(", ")}. ` +
            `Available: ${[...availableKeys].join(", ") || "(none)"}`,
        );
      }
    }

    if (mod.optionalRequires) {
      const missing = mod.optionalRequires.filter((key) => !availableKeys.has(key as string));
      if (missing.length > 0) {
        console.warn(
          `[@react-router-modules/runtime] Module "${mod.id}" has optional dependencies not provided: ` +
            `${missing.map(String).join(", ")}. The module will still load but may have reduced functionality.`,
        );
      }
    }
  }
}
