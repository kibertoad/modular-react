// React Router v7 types `RouteObject.handle` as `unknown` and does not
// expose a module-augmentation point for narrowing it. So modules in this
// example type their handle at the call site with `satisfies AppRouteData`
// (or `const handle: AppRouteData = { ... }`). See modules/*/src/index.ts
// for the pattern.
//
// If you have the option, the equivalent pattern for TanStack Router uses
// `declare module "@tanstack/router-core" { interface StaticDataRouteOption
// extends AppRouteData {} }` — the TSR example in this repo shows that.

export {};
