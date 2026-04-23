import { describe, expect, it } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-react/core";
import { defineJourney } from "@modular-react/journeys";
import { createRegistry } from "./registry.js";

const aExits = { go: defineExit<{ amount: number }>(), done: defineExit() } as const;
const moduleA = defineModule({
  id: "a",
  version: "1.0.0",
  exitPoints: aExits,
  entryPoints: {
    review: defineEntry({ component: (() => null) as any, input: schema<{ id: string }>() }),
  },
});

type Modules = { readonly a: typeof moduleA };

const journey = defineJourney<Modules, { id: string }>()({
  id: "demo",
  version: "1.0.0",
  initialState: ({ id }: { id: string }) => ({ id }),
  start: (s) => ({ module: "a", entry: "review", input: { id: s.id } }),
  transitions: {
    a: { review: { go: () => ({ complete: null }), done: () => ({ complete: null }) } },
  },
});

describe("registry.registerJourney + resolveManifest", () => {
  it("exposes manifest.journeys when at least one is registered", () => {
    const registry = createRegistry({});
    registry.register(moduleA);
    registry.registerJourney(journey);
    const manifest = registry.resolveManifest();
    expect(manifest.journeys.listDefinitions()).toEqual([
      { id: "demo", version: "1.0.0", meta: undefined },
    ]);
    expect(manifest.moduleDescriptors.a).toBe(moduleA);
  });

  it("manifest.journeys is a no-op runtime when no journey is registered", () => {
    const registry = createRegistry({});
    registry.register(moduleA);
    const manifest = registry.resolveManifest();
    expect(manifest.journeys.listDefinitions()).toEqual([]);
    expect(manifest.journeys.listInstances()).toEqual([]);
    expect(() => manifest.journeys.start("nope", {})).toThrow(/Unknown journey id/);
  });

  it("aggregates validation errors at resolveManifest time", () => {
    const registry = createRegistry({});
    registry.register(moduleA);
    const bad = {
      ...journey,
      id: "bad",
      transitions: { ghost: { review: { go: () => ({ complete: null }) } } as any },
    } as typeof journey;
    registry.registerJourney(bad);
    expect(() => registry.resolveManifest()).toThrow(/unknown module id "ghost"/);
  });

  it("forwards onModuleExit on the manifest", () => {
    const registry = createRegistry({});
    registry.register(moduleA);
    const onModuleExit = () => {};
    const manifest = registry.resolveManifest({ onModuleExit });
    expect(manifest.onModuleExit).toBe(onModuleExit);
  });
});
