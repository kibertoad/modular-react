import type {} from "@tanstack/router-core";
import type { AppRouteData } from "./app-types.js";

// TanStack Router exposes StaticDataRouteOption as the formal augmentation
// point for route-level static data. Extending it with AppRouteData means
// `staticData: { ... }` on a route is type-checked against the app's shape
// — typos in feature flag names, wrong types on pageTitle, all caught at
// compile time across every module.
//
// The bare `import type {}` above pulls the module into the type graph so
// TypeScript can resolve the augmentation target. It is stripped by the
// bundler; no runtime cost.
declare module "@tanstack/router-core" {
  interface StaticDataRouteOption extends AppRouteData {}
}

export {};
