import { createContext, useContext } from "react";
import type { NavigationManifest } from "./types.js";

export const NavigationContext = createContext<NavigationManifest | null>(null);

/**
 * Access the auto-generated navigation manifest from registered modules.
 * Use this in layout components to render sidebar/nav items.
 */
export function useNavigation(): NavigationManifest {
  const nav = useContext(NavigationContext);
  if (!nav) {
    throw new Error(
      "[@tanstack-react-modules/runtime] useNavigation must be used within a <ReactiveApp />.",
    );
  }
  return nav;
}
