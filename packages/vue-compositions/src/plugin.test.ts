import { defineComponent, h, type Component } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineExitContract, defineModule } from "@modular-frontend/core";

import {
  CompositionValidationError,
  defineComposition,
} from "@modular-frontend/compositions-engine";
import type {
  AnyCompositionDefinition,
  CompositionRuntime,
} from "@modular-frontend/compositions-engine";
import { compositionsPlugin } from "./plugin.js";
import type { CompositionsPluginExtension } from "./plugin.js";
import { useCompositionsContext } from "./provider.js";

const trivial = defineComposition<{}, { tick: number }>()({
  id: "trivial",
  version: "1.0.0",
  initialState: () => ({ tick: 0 }),
  zones: { only: { select: () => ({ kind: "empty" }) as const } },
});

/** Build the plugin and grab its registration surface through `extend()`. */
function setup(options?: Parameters<typeof compositionsPlugin>[0]) {
  const plugin = compositionsPlugin(options);
  const ext = plugin.extend({ markDirty: () => {} }) as CompositionsPluginExtension;
  return { plugin, ext };
}

describe("compositionsPlugin", () => {
  it("names itself 'compositions'", () => {
    expect(compositionsPlugin().name).toBe("compositions");
  });

  it("registerComposition validates the definition shape and rejects malformed compositions", () => {
    const { ext } = setup();
    expect(() => ext.registerComposition({} as unknown as never)).toThrow(
      CompositionValidationError,
    );
  });

  it("validate passes when the referenced modules satisfy the zones", () => {
    const { plugin, ext } = setup();
    ext.registerComposition(trivial as never);
    expect(() => plugin.validate?.({ modules: [] })).not.toThrow();
  });

  it("validate fails when a zone contract is unsatisfied by the supplied modules", () => {
    const closeContract = defineExitContract<{ ok: boolean }>("close");
    const editor = defineModule({ id: "editor", version: "1.0.0", exitPoints: {} });
    type Mods = { readonly editor: typeof editor };
    const needsContract = defineComposition<Mods, {}>()({
      id: "needs-contract",
      version: "1.0.0",
      initialState: () => ({}),
      zones: {
        a: { select: () => ({ kind: "empty" }), contract: closeContract },
      },
    });
    const { plugin, ext } = setup();
    ext.registerComposition(needsContract as never);
    expect(() => plugin.validate?.({ modules: [editor] })).toThrow(CompositionValidationError);
  });

  it("onResolve produces a CompositionRuntime that can start the registered composition", () => {
    const { plugin, ext } = setup();
    ext.registerComposition(trivial as never);
    const runtime = plugin.onResolve?.({
      modules: [],
      moduleDescriptors: {},
      debug: false,
    }) as CompositionRuntime;

    expect(runtime.isRegistered("trivial")).toBe(true);
    const id = runtime.start("trivial", undefined);
    expect(runtime.getInstance(id)).not.toBeNull();
  });

  it("throws when the same plugin instance is resolved twice", () => {
    const { plugin } = setup();
    plugin.onResolve?.({ modules: [], moduleDescriptors: {}, debug: false });
    expect(() => plugin.onResolve?.({ modules: [], moduleDescriptors: {}, debug: false })).toThrow(
      /resolved twice/,
    );
  });

  it("throws when registerComposition is called after onResolve", () => {
    const { plugin, ext } = setup();
    plugin.onResolve?.({ modules: [], moduleDescriptors: {}, debug: false });
    expect(() =>
      ext.registerComposition(trivial as unknown as AnyCompositionDefinition as never),
    ).toThrow(/after the plugin already resolved/);
  });

  it("providers contributes a Vue provider that exposes the runtime to descendants", () => {
    const { plugin, ext } = setup();
    ext.registerComposition(trivial as never);
    const runtime = plugin.onResolve?.({
      modules: [],
      moduleDescriptors: {},
      debug: false,
    }) as CompositionRuntime;

    const [Provider] = plugin.providers?.({ runtime }) ?? [];
    expect(Provider).toBeTruthy();

    let seenRuntime: CompositionRuntime | undefined;
    const Host = defineComponent({
      setup() {
        seenRuntime = useCompositionsContext()?.runtime;
        return () => null;
      },
    });
    mount(Provider as Component, { slots: { default: () => h(Host) } });

    expect(seenRuntime).toBe(runtime);
  });
});
