import { describe, it, expect, vi } from "vitest";
import {
  buildSlotsManifest,
  collectDynamicSlotFactories,
  evaluateDynamicSlots,
} from "@modular-react/core";
import type { DynamicSlotFactory, SlotFilter } from "@modular-react/core";
import { createSlotsSignal } from "@modular-react/react";
import type { ModuleDescriptor } from "@react-router-modules/core";

// Plain interface — no index signature or SlotMap extends needed
interface TestSlots {
  commands: { id: string; label: string }[];
  badges: { type: string }[];
}

interface TestDeps {
  auth: { user: { role: string } | null };
}

function fakeModule(
  overrides: Partial<ModuleDescriptor<TestDeps, TestSlots>> = {},
): ModuleDescriptor<TestDeps, TestSlots> {
  return {
    id: overrides.id ?? "test",
    version: "0.1.0",
    ...overrides,
  };
}

describe("buildSlotsManifest", () => {
  it("returns empty object when no modules have slots", () => {
    const result = buildSlotsManifest<TestSlots>([
      fakeModule({ id: "a" }),
      fakeModule({ id: "b" }),
    ]);

    expect(result).toEqual({});
  });

  it("collects slots from a single module", () => {
    const result = buildSlotsManifest<TestSlots>([
      fakeModule({
        id: "billing",
        slots: {
          commands: [{ id: "cmd-1", label: "Open Billing" }],
        },
      }),
    ]);

    expect(result.commands).toEqual([{ id: "cmd-1", label: "Open Billing" }]);
  });

  it("concatenates slots from multiple modules", () => {
    const result = buildSlotsManifest<TestSlots>([
      fakeModule({
        id: "billing",
        slots: {
          commands: [{ id: "cmd-1", label: "Open Billing" }],
          badges: [{ type: "overdue" }],
        },
      }),
      fakeModule({
        id: "users",
        slots: {
          commands: [{ id: "cmd-2", label: "View Users" }],
        },
      }),
    ]);

    expect(result.commands).toEqual([
      { id: "cmd-1", label: "Open Billing" },
      { id: "cmd-2", label: "View Users" },
    ]);
    expect(result.badges).toEqual([{ type: "overdue" }]);
  });

  it("skips modules without slots property", () => {
    const result = buildSlotsManifest<TestSlots>([
      fakeModule({ id: "no-slots" }),
      fakeModule({
        id: "with-slots",
        slots: { commands: [{ id: "cmd-1", label: "Test" }] },
      }),
    ]);

    expect(result.commands).toEqual([{ id: "cmd-1", label: "Test" }]);
  });

  it("handles empty slot arrays", () => {
    const result = buildSlotsManifest<TestSlots>([
      fakeModule({
        id: "empty",
        slots: { commands: [] },
      }),
    ]);

    expect(result.commands).toEqual([]);
  });

  it("initializes declared keys from defaults even when no module contributes", () => {
    const result = buildSlotsManifest<TestSlots>([fakeModule({ id: "no-slots" })], {
      commands: [],
      badges: [],
    });

    expect(result.commands).toEqual([]);
    expect(result.badges).toEqual([]);
  });

  it("appends module contributions to defaults", () => {
    const result = buildSlotsManifest<TestSlots>(
      [
        fakeModule({
          id: "billing",
          slots: { commands: [{ id: "cmd-1", label: "Open Billing" }] },
        }),
      ],
      { commands: [], badges: [] },
    );

    expect(result.commands).toEqual([{ id: "cmd-1", label: "Open Billing" }]);
    expect(result.badges).toEqual([]);
  });
});

describe("collectDynamicSlotFactories", () => {
  it("returns empty array when no modules have dynamicSlots", () => {
    const factories = collectDynamicSlotFactories([
      fakeModule({ id: "a" }),
      fakeModule({ id: "b" }),
    ]);

    expect(factories).toEqual([]);
  });

  it("collects dynamicSlots functions from modules that have them", () => {
    const dynamicFn = (deps: TestDeps) => ({
      commands: deps.auth.user ? [{ id: "dyn", label: "Dynamic" }] : [],
    });

    const factories = collectDynamicSlotFactories([
      fakeModule({ id: "static-only", slots: { commands: [{ id: "s", label: "S" }] } }),
      fakeModule({ id: "dynamic", dynamicSlots: dynamicFn }),
    ]);

    expect(factories).toHaveLength(1);
    expect(factories[0]).toBe(dynamicFn);
  });

  it("collects from multiple modules", () => {
    const fn1 = () => ({ commands: [] });
    const fn2 = () => ({ badges: [] });

    const factories = collectDynamicSlotFactories([
      fakeModule({ id: "a", dynamicSlots: fn1 as any }),
      fakeModule({ id: "b", dynamicSlots: fn2 as any }),
    ]);

    expect(factories).toHaveLength(2);
  });
});

describe("evaluateDynamicSlots", () => {
  const baseSlots: TestSlots = {
    commands: [{ id: "static-1", label: "Static Command" }],
    badges: [],
  };

  it("returns base slots when no factories are provided", () => {
    const result = evaluateDynamicSlots<TestSlots>(baseSlots, [], {});

    expect(result.commands).toEqual([{ id: "static-1", label: "Static Command" }]);
    expect(result.badges).toEqual([]);
  });

  it("merges dynamic contributions with base slots", () => {
    const factory: DynamicSlotFactory = () => ({
      commands: [{ id: "dyn-1", label: "Dynamic Command" }],
    });

    const result = evaluateDynamicSlots<TestSlots>(baseSlots, [factory], {});

    expect(result.commands).toEqual([
      { id: "static-1", label: "Static Command" },
      { id: "dyn-1", label: "Dynamic Command" },
    ]);
  });

  it("evaluates factory with deps and conditionally contributes", () => {
    const factory: DynamicSlotFactory = (deps) => {
      const auth = deps.auth as { user: { role: string } | null };
      return {
        commands: auth.user?.role === "admin" ? [{ id: "admin", label: "Admin Panel" }] : [],
      };
    };

    // With admin user
    const adminResult = evaluateDynamicSlots<TestSlots>(baseSlots, [factory], {
      auth: { user: { role: "admin" } },
    });
    expect(adminResult.commands).toEqual([
      { id: "static-1", label: "Static Command" },
      { id: "admin", label: "Admin Panel" },
    ]);

    // With regular user
    const userResult = evaluateDynamicSlots<TestSlots>(baseSlots, [factory], {
      auth: { user: { role: "viewer" } },
    });
    expect(userResult.commands).toEqual([{ id: "static-1", label: "Static Command" }]);

    // With no user (logged out)
    const anonResult = evaluateDynamicSlots<TestSlots>(baseSlots, [factory], {
      auth: { user: null },
    });
    expect(anonResult.commands).toEqual([{ id: "static-1", label: "Static Command" }]);
  });

  it("merges contributions from multiple factories", () => {
    const factory1: DynamicSlotFactory = () => ({
      commands: [{ id: "dyn-1", label: "From Factory 1" }],
    });
    const factory2: DynamicSlotFactory = () => ({
      commands: [{ id: "dyn-2", label: "From Factory 2" }],
      badges: [{ type: "new" }],
    });

    const result = evaluateDynamicSlots<TestSlots>(baseSlots, [factory1, factory2], {});

    expect(result.commands).toEqual([
      { id: "static-1", label: "Static Command" },
      { id: "dyn-1", label: "From Factory 1" },
      { id: "dyn-2", label: "From Factory 2" },
    ]);
    expect(result.badges).toEqual([{ type: "new" }]);
  });

  it("initializes new slot keys from dynamic contributions", () => {
    const factory: DynamicSlotFactory = () => ({
      badges: [{ type: "urgent" }],
    });

    const sparseBase = { commands: [{ id: "cmd", label: "Cmd" }] } as unknown as TestSlots;
    const result = evaluateDynamicSlots<TestSlots>(sparseBase, [factory], {});

    expect(result.badges).toEqual([{ type: "urgent" }]);
  });

  it("does not mutate the base slots", () => {
    const factory: DynamicSlotFactory = () => ({
      commands: [{ id: "dyn", label: "Dynamic" }],
    });

    const originalCommands = [...baseSlots.commands];
    evaluateDynamicSlots<TestSlots>(baseSlots, [factory], {});

    expect(baseSlots.commands).toEqual(originalCommands);
  });

  it("skips factory that returns null/undefined", () => {
    const factory: DynamicSlotFactory = () => null as any;

    const result = evaluateDynamicSlots<TestSlots>(baseSlots, [factory], {});

    expect(result.commands).toEqual([{ id: "static-1", label: "Static Command" }]);
  });

  describe("with slotFilter", () => {
    it("applies filter after merging all contributions", () => {
      const factory: DynamicSlotFactory = () => ({
        commands: [{ id: "dyn-1", label: "Dynamic" }],
      });

      const filter: SlotFilter = (slots) => ({
        ...slots,
        commands: (slots.commands as { id: string; label: string }[]).filter(
          (cmd) => cmd.id !== "static-1",
        ),
      });

      const result = evaluateDynamicSlots<TestSlots>(baseSlots, [factory], {}, filter);

      expect(result.commands).toEqual([{ id: "dyn-1", label: "Dynamic" }]);
    });

    it("receives current deps in the filter", () => {
      const filter: SlotFilter = (slots, deps) => {
        const auth = deps.auth as { user: { role: string } | null };
        if (auth.user?.role !== "admin") {
          return {
            ...slots,
            commands: (slots.commands as { id: string; label: string }[]).filter(
              (cmd) => !cmd.id.startsWith("admin"),
            ),
          };
        }
        return slots;
      };

      const slotsWithAdmin: TestSlots = {
        commands: [
          { id: "public-1", label: "Public" },
          { id: "admin-1", label: "Admin Only" },
        ],
        badges: [],
      };

      // Non-admin: admin items filtered out
      const viewerResult = evaluateDynamicSlots<TestSlots>(
        slotsWithAdmin,
        [],
        { auth: { user: { role: "viewer" } } },
        filter,
      );
      expect(viewerResult.commands).toEqual([{ id: "public-1", label: "Public" }]);

      // Admin: all items kept
      const adminResult = evaluateDynamicSlots<TestSlots>(
        slotsWithAdmin,
        [],
        { auth: { user: { role: "admin" } } },
        filter,
      );
      expect(adminResult.commands).toEqual([
        { id: "public-1", label: "Public" },
        { id: "admin-1", label: "Admin Only" },
      ]);
    });

    it("works with no factories, only a filter", () => {
      const filter: SlotFilter = (slots) => ({
        ...slots,
        commands: [],
      });

      const result = evaluateDynamicSlots<TestSlots>(baseSlots, [], {}, filter);

      expect(result.commands).toEqual([]);
      expect(result.badges).toEqual([]);
    });
  });
});

describe("createSlotsSignal", () => {
  it("notifies all subscribers when notify is called", () => {
    const signal = createSlotsSignal();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    signal.subscribe(listener1);
    signal.subscribe(listener2);
    signal.notify();

    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();
  });

  it("does not call unsubscribed listeners", () => {
    const signal = createSlotsSignal();
    const listener = vi.fn();

    const unsubscribe = signal.subscribe(listener);
    unsubscribe();
    signal.notify();

    expect(listener).not.toHaveBeenCalled();
  });

  it("handles notify with no subscribers", () => {
    const signal = createSlotsSignal();
    // Should not throw
    signal.notify();
  });
});
