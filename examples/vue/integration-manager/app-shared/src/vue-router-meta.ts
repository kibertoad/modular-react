import type {} from "vue-router";
import type { AppRouteData } from "./app-types.js";

// vue-router exposes a single global `RouteMeta` interface as the formal
// augmentation point for route-level static data. Extending it with
// `AppRouteData` means `meta: { ... }` on a route is type-checked against the
// app's shape everywhere the runtime reads it — typos in `pageTitle`, a wrong
// type on `integration`, all caught at compile time across every module.
//
// This lives in `app-shared` (not in the library) because `RouteMeta` is
// global: a library that augmented it would force its shape on every consumer.
// The app owns its own route-data vocabulary here.
//
// The bare `import type {}` above pulls vue-router into the type graph so
// TypeScript can resolve the augmentation target. It is erased by the bundler;
// no runtime cost. This is the vue-router analog of the React Router example's
// call-site `satisfies AppRouteData` and the TanStack example's
// `StaticDataRouteOption` augmentation.
declare module "vue-router" {
  interface RouteMeta extends AppRouteData {}
}

export {};
