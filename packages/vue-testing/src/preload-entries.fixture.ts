// Test fixture for `preload-entries.test.ts`. Lives next to the test so the
// `*.fixture.*` glob in tsconfig.json's `exclude` keeps it out of the published
// build. The "real" default export is replaced by `vi.mock` in the test —
// asserting the cached module ends up as the mocked one is the proof that
// `preloadEntries` honors vitest's module-mocking hoisting.

const RealComponent: { (): null; displayName: string } = () => null;
RealComponent.displayName = "real";

export default RealComponent;
