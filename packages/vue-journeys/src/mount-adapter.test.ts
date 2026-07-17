import { defineComponent, h, type PropType } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineEntry, defineExit, defineModule, schema } from "@modular-frontend/core";
import type { Component } from "vue";
import { createJourneyRuntime, defineJourney } from "@modular-frontend/journeys-engine";
import { createJourneyMountAdapter } from "./mount-adapter.js";

// --- A small drivable two-step journey ---------------------------------------

const profileExits = { save: defineExit<{ name: string }>() } as const;

const EditProfile = defineComponent({
  name: "EditProfile",
  props: {
    input: { type: Object as PropType<{ name: string }>, required: true },
    exit: { type: Function as PropType<(n: string, o?: unknown) => void>, required: true },
  },
  setup(props) {
    return () =>
      h("div", [
        h("div", { "data-testid": "profile-name" }, props.input.name),
        h(
          "button",
          { "data-testid": "save", onClick: () => props.exit("save", { name: props.input.name }) },
          "save",
        ),
      ]);
  },
});

const profileModule = defineModule({
  id: "profile",
  version: "1.0.0",
  exitPoints: profileExits,
  entryPoints: {
    edit: defineEntry({
      component: EditProfile as never,
      input: schema<{ name: string }>(),
    }),
  },
});

const planExits = { finish: defineExit<{ name: string }>() } as const;

const ChoosePlan = defineComponent({
  name: "ChoosePlan",
  props: {
    input: { type: Object as PropType<{ name: string }>, required: true },
    exit: { type: Function as PropType<(n: string, o?: unknown) => void>, required: true },
  },
  setup(props) {
    return () =>
      h("div", [
        h("div", { "data-testid": "plan-for" }, props.input.name),
        h(
          "button",
          {
            "data-testid": "finish",
            onClick: () => props.exit("finish", { name: props.input.name }),
          },
          "finish",
        ),
      ]);
  },
});

const planModule = defineModule({
  id: "plan",
  version: "1.0.0",
  exitPoints: planExits,
  entryPoints: {
    choose: defineEntry({
      component: ChoosePlan as never,
      input: schema<{ name: string }>(),
    }),
  },
});

type Modules = { readonly profile: typeof profileModule; readonly plan: typeof planModule };

const journey = defineJourney<Modules, { name: string }>()({
  id: "onboarding",
  version: "1.0.0",
  initialState: (input: { name: string }) => ({ name: input.name }),
  start: (s) => ({ module: "profile", entry: "edit", input: { name: s.name } }),
  transitions: {
    profile: {
      edit: {
        save: ({ output }) => ({
          next: { module: "plan", entry: "choose", input: { name: output.name } },
        }),
      },
    },
    plan: {
      choose: {
        finish: ({ output }) => ({ complete: { name: output.name } }),
      },
    },
  },
});

const modules = { profile: profileModule, plan: planModule };

function makeRuntime() {
  return createJourneyRuntime([{ definition: journey, options: undefined }], {
    modules,
    debug: false,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createJourneyMountAdapter", () => {
  it("exposes the generic RuntimeMountAdapter shape (start / end / Outlet)", () => {
    const adapter = createJourneyMountAdapter(makeRuntime());
    expect(typeof adapter.start).toBe("function");
    expect(typeof adapter.end).toBe("function");
    expect(adapter.Outlet).toBeDefined();
  });

  it("start() forwards to the runtime and returns a live instance id", () => {
    const runtime = makeRuntime();
    const adapter = createJourneyMountAdapter(runtime);

    const id = adapter.start("onboarding", { name: "Ada" });

    // The id names a real, active instance sitting on the journey's start step.
    const instance = runtime.getInstance(id);
    expect(instance?.status).toBe("active");
    expect(instance?.step?.moduleId).toBe("profile");
    expect(instance?.state).toEqual({ name: "Ada" });
  });

  it("Outlet renders (and drives) the instance against the captured runtime with no <JourneyProvider>", async () => {
    const runtime = makeRuntime();
    const adapter = createJourneyMountAdapter(runtime);

    // This mirrors exactly what `<CompositionOutlet>` does for a `kind: "journey"`
    // zone: mint an id via the adapter, then render `adapter.Outlet` with only
    // `{ instanceId }` — no runtime prop, no <JourneyProvider> ancestor.
    const id = adapter.start("onboarding", { name: "Grace" });
    const Outlet = adapter.Outlet as Component;
    const wrapper = mount(Outlet, { props: { instanceId: id } });

    // First step rendered, bound to the runtime the adapter captured.
    expect(wrapper.get('[data-testid="profile-name"]').text()).toBe("Grace");

    // Driving an exit transitions the same instance to the next step.
    await wrapper.get('[data-testid="save"]').trigger("click");
    expect(wrapper.get('[data-testid="plan-for"]').text()).toBe("Grace");

    // And to the terminal.
    await wrapper.get('[data-testid="finish"]').trigger("click");
    expect(runtime.getInstance(id)?.status).toBe("completed");
  });

  it("end() forwards to runtime.end with the adapter-end reason and tears the instance down", () => {
    const runtime = makeRuntime();
    const endSpy = vi.spyOn(runtime, "end");
    const adapter = createJourneyMountAdapter(runtime);

    const id = adapter.start("onboarding", { name: "Edsger" });
    expect(runtime.getInstance(id)?.status).toBe("active");

    adapter.end!(id);

    expect(endSpy).toHaveBeenCalledWith(id, { reason: "adapter-end" });
    expect(runtime.getInstance(id)?.status).toBe("aborted");
  });
});
