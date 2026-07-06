import { describe, it, expect, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";

import { ModuleErrorBoundary } from "./error-boundary.js";

const Throwing = defineComponent({
  props: { error: { type: Object, required: true } },
  setup(props) {
    return () => {
      throw props.error;
    };
  },
});

describe("ModuleErrorBoundary", () => {
  it("renders children when no error", () => {
    const wrapper = mount(ModuleErrorBoundary, {
      props: { moduleId: "test" },
      slots: { default: () => h("div", "All good") },
    });
    expect(wrapper.text()).toContain("All good");
  });

  it("renders default error UI on error", async () => {
    // Suppress Vue's console.error for the expected boundary log.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const wrapper = mount(ModuleErrorBoundary, {
      props: { moduleId: "billing" },
      slots: { default: () => h(Throwing, { error: new Error("something broke") }) },
    });
    // The boundary swaps to the notice on the re-render its `error` ref queues.
    await nextTick();
    expect(wrapper.text()).toContain("billing");
    expect(wrapper.text()).toContain("something broke");

    spy.mockRestore();
  });

  it("renders custom fallback on error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const wrapper = mount(ModuleErrorBoundary, {
      props: { moduleId: "billing", fallback: () => h("div", "Custom fallback") },
      slots: { default: () => h(Throwing, { error: new Error("boom") }) },
    });
    await nextTick();
    expect(wrapper.text()).toContain("Custom fallback");

    spy.mockRestore();
  });
});
