// Component-level tests for the outlet's behavior around invoke/resume:
//   - leafOnly default renders the leaf step (parent hidden while the child is
//     in flight, then resurfaces after resume).
//   - leafOnly=false stays on the parent's step so a second outlet could render
//     the child.
//   - useJourneyCallStack returns root-to-leaf and updates on transitions.
//   - onFinished fires for the root only — not for child terminations.
//   - Abandon-on-unmount targets the root and cascades to the child.

import { defineComponent, h, type PropType } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import {
  createJourneyRuntime,
  defineJourney,
  defineJourneyHandle,
  invoke,
} from "@modular-frontend/journeys-engine";
import { JourneyOutlet, useJourneyCallStack } from "./outlet.js";

// --- Modules -----------------------------------------------------------------

const childExits = { done: defineExit<{ token: string }>() } as const;
const VerifyComponent = defineComponent({
  name: "VerifyComponent",
  props: {
    input: { type: Object as PropType<{ subject: string }>, required: true },
    exit: { type: Function as PropType<(n: string, o?: unknown) => void>, required: true },
  },
  setup(props) {
    return () =>
      h("div", [
        h("div", { "data-testid": "verify-subject" }, props.input.subject),
        h(
          "button",
          {
            "data-testid": "verify-done",
            onClick: () => props.exit("done", { token: `T-${props.input.subject}` }),
          },
          "verify-done",
        ),
      ]);
  },
});
const childMod = defineModule({
  id: "verifier",
  version: "1.0.0",
  exitPoints: childExits,
  entryPoints: {
    review: defineEntry({
      component: VerifyComponent as never,
      input: schema<{ subject: string }>(),
    }),
  },
});

const childJourney = defineJourney<
  { verifier: typeof childMod },
  { subject: string },
  { token: string }
>()({
  id: "verify",
  version: "1.0.0",
  initialState: (input: { subject: string }) => ({ subject: input.subject }),
  start: (s) => ({ module: "verifier", entry: "review", input: { subject: s.subject } }),
  transitions: {
    verifier: { review: { done: ({ output }) => ({ complete: { token: output.token } }) } },
  },
});
const childHandle = defineJourneyHandle(childJourney);

const parentExits = { pickPlan: defineExit() } as const;
const ReviewComponent = defineComponent({
  name: "ReviewComponent",
  props: {
    input: { type: Object as PropType<{ orderId: string }>, required: true },
    exit: { type: Function as PropType<(n: string, o?: unknown) => void>, required: true },
  },
  setup(props) {
    return () =>
      h("div", [
        h("div", { "data-testid": "review-order" }, props.input.orderId),
        h(
          "button",
          { "data-testid": "review-pick", onClick: () => props.exit("pickPlan") },
          "pick",
        ),
      ]);
  },
});
const ConfirmComponent = defineComponent({
  name: "ConfirmComponent",
  props: {
    input: { type: Object as PropType<{ orderId: string; token: string }>, required: true },
  },
  setup(props) {
    return () =>
      h("div", { "data-testid": "confirm" }, `${props.input.orderId}:${props.input.token}`);
  },
});

const parentMod = defineModule({
  id: "checkout",
  version: "1.0.0",
  exitPoints: parentExits,
  entryPoints: {
    review: defineEntry({
      component: ReviewComponent as never,
      input: schema<{ orderId: string }>(),
    }),
    confirm: defineEntry({
      component: ConfirmComponent as never,
      input: schema<{ orderId: string; token: string }>(),
    }),
  },
});

interface ParentState {
  readonly orderId: string;
  readonly token: string | null;
}

const parentJourney = defineJourney<{ checkout: typeof parentMod }, ParentState>()({
  id: "checkout",
  version: "1.0.0",
  initialState: (input: { orderId: string }) => ({ orderId: input.orderId, token: null }),
  start: (s) => ({ module: "checkout", entry: "review", input: { orderId: s.orderId } }),
  transitions: {
    checkout: {
      review: {
        pickPlan: ({ state }) =>
          invoke({ handle: childHandle, input: { subject: state.orderId }, resume: "afterVerify" }),
      },
    },
  },
  resumes: {
    checkout: {
      review: {
        afterVerify: ({ state, outcome }) =>
          outcome.status === "completed"
            ? {
                state: { ...state, token: outcome.payload.token },
                next: {
                  module: "checkout",
                  entry: "confirm",
                  input: { orderId: state.orderId, token: outcome.payload.token },
                },
              }
            : { abort: { reason: "verify-aborted" } },
      },
    },
  },
});
const parentHandle = defineJourneyHandle(parentJourney);

function buildRuntime() {
  return createJourneyRuntime(
    [
      { definition: parentJourney, options: undefined },
      { definition: childJourney, options: undefined },
    ],
    { modules: { checkout: parentMod, verifier: childMod }, debug: false },
  );
}

describe("JourneyOutlet — leaf-walk (default)", () => {
  it("renders parent review, then child verify after invoke, then parent confirm after resume", async () => {
    const rt = buildRuntime();
    const id = rt.start(parentHandle, { orderId: "O-99" });
    const wrapper = mount(JourneyOutlet, { props: { runtime: rt, instanceId: id } });

    expect(wrapper.get('[data-testid="review-order"]').text()).toBe("O-99");

    await wrapper.get('[data-testid="review-pick"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="review-order"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="verify-subject"]').text()).toBe("O-99");

    await wrapper.get('[data-testid="verify-done"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="verify-subject"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="confirm"]').text()).toBe("O-99:T-O-99");
  });

  it("with leafOnly=false, stays on the parent step even when a child is in flight", async () => {
    const rt = buildRuntime();
    const id = rt.start(parentHandle, { orderId: "O-100" });
    const wrapper = mount(JourneyOutlet, {
      props: { runtime: rt, instanceId: id, leafOnly: false },
    });
    await wrapper.get('[data-testid="review-pick"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="verify-subject"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="review-order"]').text()).toBe("O-100");
  });
});

describe("JourneyOutlet — onFinished binds to the root", () => {
  it("does NOT fire when the child terminates and the parent resumes", async () => {
    const rt = buildRuntime();
    const id = rt.start(parentHandle, { orderId: "O-200" });
    const onFinished = vi.fn();
    const wrapper = mount(JourneyOutlet, { props: { runtime: rt, instanceId: id, onFinished } });
    await wrapper.get('[data-testid="review-pick"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="verify-done"]').trigger("click");
    await flushPromises();
    // Parent has resumed and reached confirm — but is NOT terminal yet.
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("fires when the root itself reaches a terminal state", async () => {
    const j = defineJourney<{ checkout: typeof parentMod }, ParentState>()({
      ...parentJourney,
      id: "checkout-completes",
      resumes: {
        checkout: {
          review: {
            afterVerify: ({ outcome }) =>
              outcome.status === "completed"
                ? { complete: { token: outcome.payload.token } }
                : { abort: { reason: "x" } },
          },
        },
      },
    });
    const rt = createJourneyRuntime(
      [
        { definition: j, options: undefined },
        { definition: childJourney, options: undefined },
      ],
      { modules: { checkout: parentMod, verifier: childMod }, debug: false },
    );
    const id = rt.start(defineJourneyHandle(j), { orderId: "O-300" });
    const onFinished = vi.fn();
    const wrapper = mount(JourneyOutlet, { props: { runtime: rt, instanceId: id, onFinished } });
    await wrapper.get('[data-testid="review-pick"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="verify-done"]').trigger("click");
    await flushPromises();
    expect(onFinished).toHaveBeenCalledTimes(1);
    const [call] = onFinished.mock.calls;
    expect(call?.[0].status).toBe("completed");
    expect(call?.[0].instanceId).toBe(id);
  });
});

describe("useJourneyCallStack", () => {
  it("returns root-to-leaf instance ids and updates as the chain shifts", async () => {
    const rt = buildRuntime();
    const id = rt.start(parentHandle, { orderId: "O-CS" });
    const observed: string[] = [];
    const Probe = defineComponent({
      setup() {
        const chain = useJourneyCallStack(rt, id);
        return () => {
          observed.push(chain.value.join(">"));
          return null;
        };
      },
    });
    const wrapper = mount(
      defineComponent({
        setup() {
          return () => h("div", [h(Probe), h(JourneyOutlet, { runtime: rt, instanceId: id })]);
        },
      }),
    );
    await flushPromises();
    expect(observed.at(-1)).toBe(id);

    await wrapper.get('[data-testid="review-pick"]').trigger("click");
    await flushPromises();
    const childId = rt.getInstance(id)!.activeChildId!;
    expect(observed.at(-1)).toBe(`${id}>${childId}`);

    await wrapper.get('[data-testid="verify-done"]').trigger("click");
    await flushPromises();
    // After the child resumes, the chain collapses back to just the root.
    expect(observed.at(-1)).toBe(id);
  });
});

describe("JourneyOutlet — abandon-on-unmount cascades to the active child", () => {
  it("ends both the parent and the child when the outlet unmounts mid-invoke", async () => {
    const rt = buildRuntime();
    const id = rt.start(parentHandle, { orderId: "O-UM" });
    const wrapper = mount(JourneyOutlet, { props: { runtime: rt, instanceId: id } });
    await wrapper.get('[data-testid="review-pick"]').trigger("click");
    await flushPromises();
    const childId = rt.getInstance(id)!.activeChildId!;
    wrapper.unmount();
    // Abandon is deferred by a microtask to survive a same-tick handoff.
    await Promise.resolve();
    expect(rt.getInstance(id)!.status).toBe("aborted");
    expect(rt.getInstance(childId)!.status).toBe("aborted");
  });
});
