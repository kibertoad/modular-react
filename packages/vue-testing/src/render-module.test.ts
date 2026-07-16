// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { defineComponent, h, type PropType } from "vue";
import type { RouteRecordRaw } from "vue-router";
import { createStore, defineEntry, defineExit, schema, type ExitFn } from "@modular-frontend/core";
import { defineModule } from "@modular-vue/core";
import { createSharedComposables, useModules, useSlots } from "@modular-vue/vue";
import { renderModule } from "./render-module.js";

interface TestDeps {
  auth: { user: string | null };
  api: { baseUrl: string };
}
type TestSlots = { widgets: { id: string; label: string }[] };

const { useStore, useService } = createSharedComposables<TestDeps>();

const exits = { done: defineExit<{ ok: boolean }>() } as const;

const Entry = defineComponent({
  props: {
    input: { type: Object as PropType<{ id: string }>, required: true },
    exit: { type: Function as PropType<ExitFn<typeof exits>>, required: true },
  },
  setup(props) {
    return () =>
      h(
        "button",
        { class: "go", onClick: () => props.exit("done", { ok: true }) },
        `id:${props.input.id}`,
      );
  },
});

const entryModule = defineModule({
  id: "entry-mod",
  version: "1.0.0",
  exitPoints: exits,
  entryPoints: {
    main: defineEntry({ component: Entry, input: schema<{ id: string }>() }),
  },
});

describe("renderModule — entry mode", () => {
  it("renders a named entry with input and forwards exits to the spy", async () => {
    const exit = vi.fn();
    const wrapper = await renderModule(entryModule, {
      deps: {},
      entry: "main",
      input: { id: "X1" },
      exit,
    });

    expect(wrapper.get(".go").text()).toBe("id:X1");

    await wrapper.get(".go").trigger("click");
    expect(exit).toHaveBeenCalledWith("done", { ok: true });
  });

  it("throws when the named entry does not exist", async () => {
    await expect(renderModule(entryModule, { deps: {}, entry: "nope" })).rejects.toThrow(
      /Module "entry-mod" has no entry "nope"/,
    );
  });
});

describe("renderModule — createRoutes mode", () => {
  const routedModule = defineModule<TestDeps, TestSlots>({
    id: "dashboard",
    version: "2.1.0",
    createRoutes: (): RouteRecordRaw => ({
      path: "/",
      name: "dashboard",
      component: defineComponent({
        setup() {
          const user = useStore("auth", (s) => s.user);
          const api = useService("api");
          const modules = useModules();
          const slots = useSlots<TestSlots>();
          return () =>
            h("div", { class: "dash" }, [
              h("p", { class: "user" }, String(user.value)),
              h("p", { class: "api" }, api.baseUrl),
              h("p", { class: "mods" }, modules.map((m) => `${m.id}@${m.version}`).join(",")),
              h("p", { class: "slot" }, slots.value.widgets.map((w) => w.label).join(",")),
            ]);
        },
      }),
    }),
  });

  it("renders a routed module and injects deps, modules, and mock slots", async () => {
    const wrapper = await renderModule(routedModule, {
      deps: { auth: createStore({ user: "ada" }), api: { baseUrl: "http://test" } },
      slots: { widgets: [{ id: "w1", label: "Widget" }] },
    });

    expect(wrapper.find(".dash").exists()).toBe(true);
    expect(wrapper.get(".user").text()).toBe("ada");
    expect(wrapper.get(".api").text()).toBe("http://test");
    expect(wrapper.get(".mods").text()).toBe("dashboard@2.1.0");
    expect(wrapper.get(".slot").text()).toBe("Widget");
  });

  it("navigates to the provided initial route", async () => {
    const page = (label: string) =>
      defineComponent({ setup: () => () => h("div", { class: "p" }, label) });
    const multiRoute = defineModule({
      id: "multi",
      version: "1.0.0",
      createRoutes: (): RouteRecordRaw[] => [
        { path: "/", name: "home", component: page("home") },
        { path: "/settings", name: "settings", component: page("settings") },
      ],
    });

    const wrapper = await renderModule(multiRoute, { deps: {}, route: "/settings" });
    expect(wrapper.get(".p").text()).toBe("settings");
  });

  it("evaluates dynamic slots against the provided deps", async () => {
    const dynModule = defineModule<TestDeps, TestSlots>({
      id: "dyn",
      version: "1.0.0",
      dynamicSlots: (deps) => ({
        widgets: deps.auth.user ? [{ id: "u", label: `hi ${deps.auth.user}` }] : [],
      }),
      createRoutes: (): RouteRecordRaw => ({
        path: "/",
        name: "dyn",
        component: defineComponent({
          setup() {
            const slots = useSlots<TestSlots>();
            return () =>
              h("div", { class: "slot" }, slots.value.widgets.map((w) => w.label).join(","));
          },
        }),
      }),
    });

    const wrapper = await renderModule(dynModule, { deps: { auth: createStore({ user: "ada" }) } });
    expect(wrapper.get(".slot").text()).toBe("hi ada");
  });
});

describe("renderModule — component mode", () => {
  const componentModule = defineModule({
    id: "legacy",
    version: "1.0.0",
    component: defineComponent({
      props: { title: { type: String, default: "" } },
      setup(props) {
        return () => h("h2", { class: "title" }, props.title);
      },
    }),
  });

  it("renders a component-only module with props", async () => {
    const wrapper = await renderModule(componentModule, { deps: {}, props: { title: "Hello" } });
    expect(wrapper.get(".title").text()).toBe("Hello");
  });
});

describe("renderModule — misconfiguration", () => {
  it("throws when the module has neither createRoutes nor component", async () => {
    const empty = defineModule({ id: "empty", version: "1.0.0" });
    await expect(renderModule(empty, { deps: {} })).rejects.toThrow(
      /Module "empty" has neither createRoutes nor component/,
    );
  });
});
