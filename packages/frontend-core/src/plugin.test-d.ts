import { describe, expectTypeOf, it } from "vitest";
import type { PluginExtensionsOf, RegistryPlugin } from "./plugin.js";

type AlphaPlugin = RegistryPlugin<"alpha", { registerAlpha: (id: string) => void }, void>;
type AlphaPlusPlugin = RegistryPlugin<
  "alphaPlus",
  { registerAlpha: (id: string) => void; registerAlphaPlus: (id: number) => void },
  void
>;
type PlainPlugin = RegistryPlugin<"plain", object, void>;

describe("PluginExtensionsOf", () => {
  it("is object for an empty tuple", () => {
    expectTypeOf<PluginExtensionsOf<readonly []>>().toEqualTypeOf<object>();
  });

  it("keeps every extension when one plugin's extension is object", () => {
    type First = PluginExtensionsOf<readonly [PlainPlugin, AlphaPlugin]>;
    type Last = PluginExtensionsOf<readonly [AlphaPlugin, PlainPlugin]>;
    expectTypeOf<First["registerAlpha"]>().parameters.toEqualTypeOf<[string]>();
    expectTypeOf<Last["registerAlpha"]>().parameters.toEqualTypeOf<[string]>();
  });

  it("keeps an extension that is a subtype of another", () => {
    type Ext = PluginExtensionsOf<readonly [AlphaPlugin, AlphaPlusPlugin]>;
    expectTypeOf<Ext["registerAlpha"]>().parameters.toEqualTypeOf<[string]>();
    expectTypeOf<Ext["registerAlphaPlus"]>().parameters.toEqualTypeOf<[number]>();
  });

  it("is object, not any, for a non-tuple plugin array", () => {
    type Wide = PluginExtensionsOf<readonly RegistryPlugin<string, any, any>[]>;
    expectTypeOf<Wide>().not.toBeAny();
    expectTypeOf<Wide>().toEqualTypeOf<object>();
  });
});
