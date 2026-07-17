import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";

import {
  createJourneyRuntime,
  createMemoryJourneySyncPort,
  defineJourney,
} from "@modular-frontend/journeys-engine";
import type { InstanceId, JourneySyncPort } from "@modular-frontend/journeys-engine";
import { createTestHarness } from "@modular-frontend/journeys-engine/testing";
import { JourneyProvider } from "./provider.js";
import { useJourneySync } from "./use-journey-sync.js";

const exits = { next: defineExit() } as const;

function stepModule(id: string) {
  return defineModule({
    id,
    version: "1.0.0",
    exitPoints: exits,
    entryPoints: {
      show: defineEntry({
        component: (() => null) as never,
        input: schema<void>(),
        allowBack: "preserve-state",
      }),
    },
  });
}

const modA = stepModule("a");
const modB = stepModule("b");
const modules = { a: modA, b: modB };
type Modules = { readonly a: typeof modA; readonly b: typeof modB };

const journey = defineJourney<Modules, Record<string, never>>()({
  id: "two-step",
  version: "1.0.0",
  initialState: () => ({}),
  start: () => ({ module: "a", entry: "show", input: undefined }),
  transitions: {
    a: { show: { next: () => ({ next: { module: "b", entry: "show", input: undefined } }) } },
    b: { show: { allowBack: true, next: () => ({ complete: undefined }) } },
  },
});

function setup() {
  const runtime = createJourneyRuntime([{ definition: journey, options: undefined }], { modules });
  const id = runtime.start(journey.id, undefined);
  return { runtime, id, harness: createTestHarness(runtime) };
}

/**
 * Mount a probe under a JourneyProvider. The provider is not the root — a
 * root's props go through a deep `reactive()`, which would proxy the runtime
 * and defeat the raw-identity lookups the engine does internally.
 */
function mountProbe(runtime: ReturnType<typeof setup>["runtime"], probe: () => void) {
  const Probe = defineComponent({
    setup() {
      probe();
      return () => null;
    },
  });
  const Root = defineComponent({
    setup() {
      return () => h(JourneyProvider, { runtime }, () => h(Probe));
    },
  });
  return mount(Root);
}

describe("useJourneySync", () => {
  it("stamps the current step onto the URL at setup", () => {
    const { runtime, id } = setup();
    const port = createMemoryJourneySyncPort("/checkout");
    mountProbe(runtime, () => useJourneySync(id, port));

    expect(port.read()).toBe("a/show");
  });

  it("follows the journey forward and lets the location drive it back", async () => {
    const { runtime, id, harness } = setup();
    const port = createMemoryJourneySyncPort();
    mountProbe(runtime, () => useJourneySync(id, port));

    harness.fireExit(id, "next");
    await flushPromises();
    expect(port.read()).toBe("b/show");
    expect(port.entries).toEqual(["a/show", "b/show"]);

    port.go(-1);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("a");
  });

  it("re-attaches when the instance id changes", async () => {
    const { runtime, id, harness } = setup();
    const second = runtime.start(journey.id, undefined);
    const port = createMemoryJourneySyncPort();
    const which = ref<InstanceId | null>(null);
    mountProbe(runtime, () => useJourneySync(which, port));

    // Null id: the composable is a no-op, so it is safe to call at setup
    // before `useJourneyHost` has started anything.
    expect(port.read()).toBe("");

    which.value = id;
    await flushPromises();
    expect(port.read()).toBe("a/show");

    which.value = second;
    await flushPromises();
    harness.fireExit(second, "next");
    await flushPromises();
    expect(port.read()).toBe("b/show");

    // The first instance is detached now — advancing it must not move the URL.
    harness.fireExit(id, "next");
    await flushPromises();
    expect(port.read()).toBe("b/show");
  });

  it("reads the port and callbacks through a getter without rebuilding the sync", async () => {
    const { runtime, id } = setup();
    const base = createMemoryJourneySyncPort();
    const replace = vi.fn(base.replace);
    const first = vi.fn();
    const second = vi.fn();
    const handler = ref(first);

    mountProbe(runtime, () =>
      useJourneySync(
        id,
        () => ({
          read: base.read,
          push: base.push,
          replace,
          go: base.go,
          subscribe: base.subscribe,
        }),
        () => ({ onUnresolved: handler.value }),
      ),
    );

    handler.value = second;
    await flushPromises();
    base.push("/settings");

    // Re-creating the sync would re-run its initial reconcile, and that
    // reconcile navigates.
    expect(replace).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("honours a port that cannot navigate relatively", async () => {
    const { runtime, id, harness } = setup();
    const base = createMemoryJourneySyncPort();
    // No `go`. The proxy the composable installs must present that absence
    // faithfully, or the reconciler would call a no-op instead of falling back
    // to `replace` and the URL would go stale.
    const port: JourneySyncPort = {
      read: base.read,
      push: base.push,
      replace: base.replace,
      subscribe: base.subscribe,
    };
    mountProbe(runtime, () => useJourneySync(id, port));

    harness.fireExit(id, "next");
    await flushPromises();
    runtime.goBack(id);

    expect(port.read()).toBe("a/show");
    expect(base.entries).toEqual(["a/show", "a/show"]);
  });

  it("stops syncing once the component unmounts", async () => {
    const { runtime, id, harness } = setup();
    const port = createMemoryJourneySyncPort();
    const wrapper = mountProbe(runtime, () => useJourneySync(id, port));

    wrapper.unmount();
    harness.fireExit(id, "next");
    await flushPromises();

    expect(port.read()).toBe("a/show");
    // And the reverse direction is detached too. Push a second entry first so
    // `go(-1)` actually moves and notifies — from index zero it would be a
    // no-op, and a leaked subscription would go undetected.
    port.push("b/show");
    port.go(-1);
    expect(runtime.getInstance(id)?.step?.moduleId).toBe("b");
  });

  it("no-ops without a provider or runtime", () => {
    const port = createMemoryJourneySyncPort("/checkout");
    const Probe = defineComponent({
      setup() {
        useJourneySync("whatever" as InstanceId, port);
        return () => null;
      },
    });
    expect(() => mount(Probe)).not.toThrow();
    expect(port.read()).toBe("/checkout");
  });
});
