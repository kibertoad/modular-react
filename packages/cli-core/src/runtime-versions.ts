/**
 * Versions of `@modular-react/*` runtime packages that the CLI bakes into
 * generated `package.json` files. Centralized so a single bump propagates
 * to every template and transform — search for any other literal pin in
 * this codebase and you've found a regression.
 */
export const RUNTIME_VERSIONS = {
  /** `@modular-react/core` — module-author-facing core. */
  core: "^1.0.0",
  /** `@modular-react/react` — React bindings. */
  react: "^1.0.0",
  /** `@modular-react/journeys` — multi-module flow runtime. */
  journeys: "^0.1.0",
} as const;
