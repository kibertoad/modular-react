import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";

/**
 * Test-only helper (not part of the public build): runs a composable inside a
 * mounted component's `setup`, the Vue analog of `@testing-library/react`'s
 * `renderHook`. Returns the composable's return value via `result()` (read
 * fresh each time), plus the wrapper so tests can `unmount()`.
 *
 * `provide` keys are `InjectionKey`/symbol → value, matching what
 * `@vue/test-utils` `global.provide` accepts.
 */
export function renderComposable<T>(
  composable: () => T,
  options?: { provide?: Record<PropertyKey, unknown> },
): { result: () => T; wrapper: VueWrapper } {
  let value!: T;
  const wrapper = mount(
    defineComponent({
      setup() {
        value = composable();
        return () => h("div");
      },
    }),
    { global: { provide: options?.provide } },
  );
  return { result: () => value, wrapper };
}
