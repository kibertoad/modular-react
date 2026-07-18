import { describe, it, expect } from "vitest";
import * as core from "./index.js";

// The facade re-exports the full neutral engine via `export *`, so new engine
// surface arrives here without an explicit re-export. These assertions pin the
// pieces consumers are documented to import from `@modular-react/core` — a
// symbol silently dropped from the engine's index would fail here, not in a
// consumer.
describe("@modular-react/core public surface", () => {
  it("re-exports the remote-manifest surface from the engine", () => {
    expect(core.mergeRemoteManifests).toBeTypeOf("function");
    expect(core.mergeRemoteManifests([])).toEqual({ slots: {}, navigation: [], meta: {} });
  });

  it("re-exports the component-registry pairing helpers and plugin", () => {
    expect(core.resolveComponentRegistry).toBeTypeOf("function");
    expect(core.pairById).toBeTypeOf("function");
    expect(core.componentPairingPlugin).toBeTypeOf("function");

    const registry = core.resolveComponentRegistry([{ id: "v", component: { n: 1 } }]);
    expect(registry.get("v")).toEqual({ n: 1 });
    expect(core.componentPairingPlugin({ componentSlot: "views", staticRefs: () => [] }).name).toBe(
      "componentPairing",
    );
  });
});
