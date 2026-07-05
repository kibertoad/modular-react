// Local ambient declaration — `@modular-frontend/core` doesn't depend on
// `@types/node`, but we deliberately reference the literal
// `process.env.NODE_ENV` token below so bundlers can statically replace
// it. The declare is scoped to this module file (it has imports/exports,
// so it doesn't pollute the global namespace) and is erased at compile
// time. Bundlers rewrite the literal access; runtime Node uses the real
// `process` global; un-bundled browsers hit the try/catch fallback.
declare const process: { env: { readonly NODE_ENV?: string } };

/**
 * Returns true when running in a non-production environment.
 *
 * Implementation note — uses a *literal* `process.env.NODE_ENV` access so
 * Vite, esbuild, Rollup (and most React bundlers) statically replace the
 * token at build time. In a production build the access becomes
 * `"production" !== "production"` (a constant `false`), letting the
 * bundler tree-shake out the dev-only branches it gates. A dynamic chain
 * like `globalThis.process?.env?.NODE_ENV` would *not* be replaced — it
 * would stay as a runtime lookup and silently return `undefined` in
 * browser bundles without a `process` shim, making dev-only features
 * (override warnings, debug logs) silently no-op instead of firing.
 *
 * The try/catch covers the rare un-bundled browser case (no static
 * replacement, no `process` global). Default to dev there so
 * dev-feedback features surface in unusual environments — production
 * builds rely on the bundler's static replacement to skip the
 * dev-branches entirely.
 */
export function isDevEnv(): boolean {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return true;
  }
}
