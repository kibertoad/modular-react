import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, defineStore, setActivePinia } from "pinia";

import type { SerializedJourney } from "@modular-frontend/journeys-engine";
import { createPiniaJourneyPersistence } from "./pinia-persistence.js";

interface WizardState {
  step: number;
}
type Blob = SerializedJourney<WizardState>;

// The adapter treats blobs as opaque, so tests build them with a cast rather
// than round-tripping a real journey.
const asBlob = (value: unknown): Blob => value as Blob;

const useJourneyStore = defineStore("journeys", {
  state: () => ({ journeys: {} as Record<string, Blob> }),
});

const keyFor = ({ journeyId, input }: { journeyId: string; input: { id: string } }) =>
  `journey:${input.id}:${journeyId}`;

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("createPiniaJourneyPersistence", () => {
  it("round-trips save / load / remove keyed by keyFor", () => {
    const store = useJourneyStore();
    const persistence = createPiniaJourneyPersistence<{ id: string }, WizardState>({
      keyFor,
      store: () => store,
    });

    const key = persistence.keyFor({ journeyId: "wizard", input: { id: "A" } });
    expect(persistence.load(key)).toBeNull();

    const blob = asBlob({ v: 1, step: 2 });
    persistence.save(key, blob);
    expect(persistence.load(key)).toEqual(blob);
    // The blob genuinely lives in Pinia state (devtools / $reset reachable).
    expect(store.journeys[key]).toBeTruthy();

    persistence.remove(key);
    expect(persistence.load(key)).toBeNull();
    expect(store.journeys[key]).toBeUndefined();
  });

  it("clones on save and load so the store cannot be mutated by reference", () => {
    const store = useJourneyStore();
    const persistence = createPiniaJourneyPersistence<{ id: string }, WizardState>({
      keyFor,
      store,
    });

    const source = asBlob({ nested: { step: 1 } });
    persistence.save("k", source);
    (source as unknown as { nested: { step: number } }).nested.step = 99; // mutate after save
    expect((persistence.load("k") as unknown as { nested: { step: number } }).nested.step).toBe(1);

    const loaded = persistence.load("k") as unknown as { nested: { step: number } };
    loaded.nested.step = 42; // mutate the loaded copy
    expect((persistence.load("k") as unknown as { nested: { step: number } }).nested.step).toBe(1);
  });

  it("no-ops when the store getter returns null (SSR / no-store path)", () => {
    const persistence = createPiniaJourneyPersistence<{ id: string }, WizardState>({
      keyFor,
      store: () => null,
    });
    expect(persistence.load("k")).toBeNull();
    expect(() => persistence.save("k", asBlob({}))).not.toThrow();
    expect(() => persistence.remove("k")).not.toThrow();
  });

  it("honors a custom stateKey", () => {
    const useCustom = defineStore("custom", {
      state: () => ({ wizards: {} as Record<string, Blob> }),
    });
    const store = useCustom();
    const persistence = createPiniaJourneyPersistence<{ id: string }, WizardState>({
      keyFor,
      store,
      stateKey: "wizards",
    });

    persistence.save("k", asBlob({ a: 1 }));
    expect(store.wizards.k).toBeTruthy();
  });

  it("hands back the live store entry when clone is false", () => {
    const store = useJourneyStore();
    const persistence = createPiniaJourneyPersistence<{ id: string }, WizardState>({
      keyFor,
      store,
      clone: false,
    });

    const blob = asBlob({ x: 1 });
    persistence.save("k", blob);
    // Pinia wraps stored state in a reactive proxy, so even un-cloned the loaded
    // value is not the same reference — but it is deep-equal and *live*.
    expect(persistence.load("k")).toEqual(blob);

    const live = persistence.load("k") as unknown as { x: number };
    live.x = 2; // mutate the un-cloned (live) entry
    expect((persistence.load("k") as unknown as { x: number }).x).toBe(2);
  });

  it("detaches the loaded copy from the store by default (clone:true)", () => {
    const store = useJourneyStore();
    const persistence = createPiniaJourneyPersistence<{ id: string }, WizardState>({
      keyFor,
      store,
    });

    persistence.save("k", asBlob({ x: 1 }));
    const detached = persistence.load("k") as unknown as { x: number };
    detached.x = 99; // mutate the detached copy
    expect((persistence.load("k") as unknown as { x: number }).x).toBe(1); // store intact
  });
});
