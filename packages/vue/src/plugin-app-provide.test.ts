import { describe, expect, it } from "vitest";
import type { InjectionKey } from "vue";

import { provideBinding } from "./plugin-app-provide.js";

describe("provideBinding", () => {
  it("pairs the key with the value", () => {
    const key: InjectionKey<{ n: number }> = Symbol("k");
    const value = { n: 1 };
    const binding = provideBinding(key, value);
    expect(binding.key).toBe(key);
    expect(binding.value).toBe(value);
  });
});
