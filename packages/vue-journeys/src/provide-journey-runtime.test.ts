import { describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h } from "vue";

import type { JourneyRuntime } from "@modular-frontend/journeys-engine";
import { provideJourneyRuntime } from "./provide-journey-runtime.js";
import { useJourneyContext, type JourneyProviderValue } from "./provider.js";

// The helper only stows the runtime under the injection key; it never touches
// runtime internals, so a structural stand-in is enough here.
const fakeRuntime = { __fake: true } as unknown as JourneyRuntime;

/**
 * Mount an app whose root component reads `useJourneyContext`, after running
 * `install` against the app. An app-level `provide` is visible to the root
 * component's `inject`, so this exercises the real provide path with no
 * reliance on Vue internals.
 */
function readContextAfter(
  install: (app: ReturnType<typeof createApp>) => void,
): JourneyProviderValue | null {
  let seen: JourneyProviderValue | null = null;
  const Probe = defineComponent({
    setup() {
      seen = useJourneyContext();
      return () => h("div");
    },
  });
  const app = createApp(Probe);
  install(app);
  app.mount(document.createElement("div"));
  app.unmount();
  return seen;
}

describe("provideJourneyRuntime", () => {
  it("provides the runtime app-wide so useJourneyContext resolves it", () => {
    const ctx = readContextAfter((app) => provideJourneyRuntime(app, fakeRuntime));
    expect(ctx).not.toBeNull();
    expect(ctx?.runtime).toBe(fakeRuntime);
  });

  it("forwards onModuleExit onto the provided context value", () => {
    const onModuleExit = vi.fn();
    const ctx = readContextAfter((app) =>
      provideJourneyRuntime(app, fakeRuntime, { onModuleExit }),
    );
    expect(ctx?.onModuleExit).toBe(onModuleExit);
  });

  it("useJourneyContext is null when nothing is provided", () => {
    const ctx = readContextAfter(() => {});
    expect(ctx).toBeNull();
  });
});
