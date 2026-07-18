// Type-level tests for the component-registry / pairing helpers.
//
// These pin the contracts a runtime test cannot catch: the component type `C`
// stays opaque (the helpers never constrain it to a framework type), `TMeta`
// flows through, and `pairById`'s three-bucket return keeps `item` typed as the
// input `T` while `component` is typed as the registry's `C`.

import { expectTypeOf, test } from "vitest";

import {
  resolveComponentRegistry,
  pairById,
  type ComponentEntry,
  type ComponentRegistry,
} from "./component-registry.js";

// Two unrelated stand-ins for framework component types.
type Vueish = { readonly __vue: true };
type Reactish = (props: unknown) => unknown;

test("C is opaque — any component type flows through get/getEntry", () => {
  const vueRegistry = resolveComponentRegistry<Vueish>([]);
  expectTypeOf(vueRegistry.get).returns.toEqualTypeOf<Vueish | undefined>();

  const reactRegistry = resolveComponentRegistry<Reactish>([]);
  expectTypeOf(reactRegistry.get).returns.toEqualTypeOf<Reactish | undefined>();
});

test("TMeta is preserved on entries and getEntry", () => {
  type Meta = { readonly title: string };
  const registry = resolveComponentRegistry<Vueish, Meta>([]);

  expectTypeOf(registry.getEntry).returns.toEqualTypeOf<ComponentEntry<Vueish, Meta> | undefined>();
  expectTypeOf(registry.entries).toEqualTypeOf<readonly ComponentEntry<Vueish, Meta>[]>();
});

test("ComponentEntry.meta is optional", () => {
  // A bare { id, component } is a valid entry — meta is optional.
  expectTypeOf<{ id: string; component: Vueish }>().toExtend<ComponentEntry<Vueish>>();
});

test("pairById keeps item typed as T and component typed as C", () => {
  interface Kind {
    readonly kind: string;
    readonly resultView?: string;
  }
  const registry: ComponentRegistry<Vueish> = resolveComponentRegistry<Vueish>([]);
  const result = pairById([] as Kind[], registry, (k) => k.resultView);

  expectTypeOf(result.paired).toEqualTypeOf<
    readonly { item: Kind; id: string; component: Vueish }[]
  >();
  expectTypeOf(result.missing).toEqualTypeOf<readonly { item: Kind; id: string }[]>();
  expectTypeOf(result.unref).toEqualTypeOf<readonly Kind[]>();
});

test("idOf may return undefined (the unref path)", () => {
  const registry = resolveComponentRegistry<Vueish>([]);
  // idOf returning `string | undefined` is accepted.
  pairById([1, 2, 3], registry, (n) => (n > 1 ? `id-${n}` : undefined));
});
