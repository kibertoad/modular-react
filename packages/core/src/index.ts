// `@modular-react/core` is the React binding's facade over the
// framework-neutral `@modular-frontend/core`. It re-exports the full neutral
// surface so existing consumers keep importing from `@modular-react/core`
// unchanged. React-specific refinements (e.g. narrowing the `UiComponent`
// seam to `React.ComponentType`) can layer on top here over time without
// moving the framework-neutral logic back.
export * from "@modular-frontend/core";
