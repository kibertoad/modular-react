import { defineComponent, h, onErrorCaptured, ref, type PropType, type VNode } from "vue";

/**
 * Contains render/lifecycle errors thrown by a module component so one broken
 * module can't take down the surrounding shell. The Vue analog of React's
 * class-based `ModuleErrorBoundary`: `onErrorCaptured` plays the role of
 * `getDerivedStateFromError` + `componentDidCatch`, flipping a local `error`
 * ref that the render function reads to swap the subtree for a notice.
 *
 * Returning `false` from `onErrorCaptured` stops the error from propagating to
 * ancestor boundaries — the same containment a React boundary gives by
 * handling the error rather than rethrowing.
 *
 * Authored with `defineComponent` + a render function (no SFC compiler in the
 * package build; see decision D4).
 */
export const ModuleErrorBoundary = defineComponent({
  name: "ModuleErrorBoundary",
  props: {
    moduleId: { type: String, required: true },
    /**
     * Noun used in the failure notice and console message for what crashed
     * (default `"Module"`). Hosts wrapping non-module contributions pass their
     * own — e.g. `<PanelsOutlet>` passes `"Panel"` — so the error names the
     * actual failing unit instead of mislabeling it a module.
     */
    label: { type: String, default: "Module" },
    /**
     * Optional replacement UI shown instead of the built-in notice. Accepts a
     * VNode or a zero-arg function returning one; mirrors the React boundary's
     * `fallback` node prop.
     */
    fallback: { type: null as unknown as PropType<VNode | (() => VNode)>, default: undefined },
  },
  setup(props, { slots }) {
    const error = ref<Error | null>(null);

    onErrorCaptured((err) => {
      error.value = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[@modular-vue/vue] ${props.label} "${props.moduleId}" encountered an error:`,
        err,
      );
      // Stop propagation — the boundary has handled it.
      return false;
    });

    return () => {
      if (error.value) {
        if (props.fallback) {
          return typeof props.fallback === "function" ? props.fallback() : props.fallback;
        }
        return h(
          "div",
          {
            style: {
              padding: "1rem",
              border: "1px solid #e53e3e",
              borderRadius: "0.5rem",
              margin: "1rem",
            },
          },
          [
            h(
              "h3",
              { style: { color: "#e53e3e", margin: "0 0 0.5rem 0" } },
              `${props.label} "${props.moduleId}" encountered an error`,
            ),
            h(
              "pre",
              { style: { fontSize: "0.875rem", color: "#718096", whiteSpace: "pre-wrap" } },
              error.value.message,
            ),
          ],
        );
      }
      return slots.default?.();
    };
  },
});
