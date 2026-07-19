import {
  computed,
  defineComponent,
  h,
  inject,
  provide,
  toValue,
  type Component,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
  type PropType,
  type VNode,
} from "vue";
import {
  resolvePanels,
  type OnDuplicateComponentId,
  type PanelEntry,
  type PanelGroupHandle,
} from "@modular-frontend/core";
import { reactiveSlotsKey, slotsKey } from "./slots-context.js";
import { ModuleErrorBoundary } from "./error-boundary.js";

/**
 * Vue host for the framework-neutral **subject-keyed panels** primitive (see
 * `resolvePanels` / `definePanelGroup` in `@modular-frontend/core`). A panel
 * group is a named region whose module-contributed panels are selected by a
 * runtime *subject* and rendered **all-matching**, ordered — the render-all
 * counterpart to the pick-one component-pairing surface.
 *
 * `usePanels` is a `computed` over the slots context + the subject; the engine
 * resolver is pure, so the composable is thin. `<PanelsOutlet>` renders every
 * resolved panel with the subject injected (as a prop **and** via `provide`),
 * each wrapped in `ModuleErrorBoundary`.
 *
 * ## Reactivity caveat
 *
 * The panels recompute when the **subject** changes — but only if the subject
 * is Vue-reactive state (a `ref`/`reactive`/Pinia value, or a `computed`
 * derived from one). A `when` predicate that reads a non-reactive snapshot
 * tracks nothing and will not re-run when that snapshot mutates. This is the
 * same source-boundary rule `useReactiveSlots` documents (see
 * `docs/reactive-slots-vue.md`); pass the subject as a ref/getter over reactive
 * state and mutable-run-state predicates track correctly.
 *
 * The **contributions** carry no such caveat: `usePanels` tracks both slot
 * sources the runtime provides, so panels contributed through `dynamicSlots`
 * update on either path — a reactive dependency changing *or* an imperative
 * `recalculateSlots()` call (see {@link injectSlotsSource}).
 */

/**
 * Injection key holding the current panel subject, provided by
 * {@link PanelsOutlet} so panel content (and its descendants) can read the
 * subject without prop-drilling. Held as a `ComputedRef` so reads stay
 * reactive to subject changes.
 */
export const panelSubjectKey: InjectionKey<ComputedRef<unknown>> = Symbol(
  "modular-vue.panelSubject",
);

/**
 * Read the subject of the enclosing {@link PanelsOutlet}. Reactive — the
 * returned `computed` updates when the outlet's subject changes. Throws when
 * called outside a `<PanelsOutlet>` so a missing host is a loud error, not a
 * silently-undefined subject.
 *
 * @example
 * ```ts
 * const block = usePanelSubject<BoardBlock>()
 * const title = computed(() => block.value.label)
 * ```
 */
export function usePanelSubject<TSubject>(): ComputedRef<TSubject> {
  const subject = inject(panelSubjectKey, null);
  if (!subject) {
    throw new Error(
      "[@modular-vue/vue] usePanelSubject must be used inside a <PanelsOutlet> " +
        "(the outlet provides the current panel subject).",
    );
  }
  return subject as ComputedRef<TSubject>;
}

/**
 * Inject the resolved-slots source. The runtime provides **two** parallel
 * sources with different update semantics: the tracked `computed`
 * ({@link reactiveSlotsKey}), re-evaluated when a *reactive* dependency read by
 * a `dynamicSlots` factory changes, and the signal `Ref` ({@link slotsKey}),
 * reassigned when `recalculateSlots()` is called (the documented path for
 * factories over *non-reactive* deps). Neither is universally fresher — each
 * update channel moves only its own source — so when both are present the
 * returned getter reads **both** (tracking both inside {@link usePanels}'
 * `computed`) and serves whichever produced the more recent evaluation. Both
 * evaluate the same factories over the same deps, so the latest evaluation is
 * always the correct one; panels therefore update on *either* path, matching
 * the React host (whose single context carries both).
 *
 * Package-internal (shared with the overlay host; deliberately not exported
 * from the package index).
 */
export function injectSlotsSource(caller = "usePanels"): () => Record<string, readonly unknown[]> {
  const reactive = inject(reactiveSlotsKey, null);
  const signal = inject(slotsKey, null);
  if (reactive && signal) {
    let prevReactive: object | undefined;
    let prevSignal: object | undefined;
    let current!: object;
    return () => {
      // Read both so the enclosing computed tracks both update channels.
      const r = reactive.value;
      const s = signal.value;
      if (prevReactive === undefined) {
        // First read: both sources describe the same initial state; start from
        // the tracked computed.
        current = r;
      } else {
        // Serve the source that changed since the last read. If both changed,
        // they re-evaluated over the same state — prefer the tracked computed.
        if (s !== prevSignal) current = s;
        if (r !== prevReactive) current = r;
      }
      prevReactive = r;
      prevSignal = s;
      return current as Record<string, readonly unknown[]>;
    };
  }
  if (reactive) return () => reactive.value as Record<string, readonly unknown[]>;
  if (signal) return () => signal.value as Record<string, readonly unknown[]>;
  throw new Error(
    `[@modular-vue/vue] ${caller} must be used within a modular app ` +
      "(install the resolved manifest so a slots source is provided).",
  );
}

/**
 * Resolve a panel group against a subject as a reactive `computed`.
 *
 * Every input is a `MaybeRefOrGetter`, resolved *inside* the `computed` so it
 * is live: pass the subject as a `ref`, a getter, or a Pinia `computed` so the
 * panels re-resolve when it changes (see the reactivity caveat above), and
 * pass `group` / `onDuplicate` reactively too if they can change (plain values
 * work as usual — group handles are typically module-level constants). The
 * pure `resolvePanels` recomputes on the slot contributions, the subject, or
 * either option changing.
 *
 * @example
 * ```ts
 * const panels = usePanels(inspectorPanels, () => board.selectedBlock)
 * // panels.value → the ordered PanelEntry[] whose `when(block)` matched
 * ```
 */
export function usePanels<TSubject>(
  group: MaybeRefOrGetter<PanelGroupHandle<TSubject>>,
  subject: MaybeRefOrGetter<TSubject | null | undefined>,
  opts?: { onDuplicate?: MaybeRefOrGetter<OnDuplicateComponentId | undefined> },
): ComputedRef<readonly PanelEntry<TSubject>[]> {
  const readSlots = injectSlotsSource();
  return computed(() =>
    resolvePanels(
      (readSlots()[toValue(group).slotKey] ?? []) as readonly PanelEntry<TSubject>[],
      toValue(subject),
      { onDuplicate: toValue(opts?.onDuplicate) },
    ),
  );
}

function keyFor(entry: PanelEntry<unknown>, subjectKey: unknown, subject: unknown): string {
  if (subjectKey === undefined) return entry.id;
  const discriminator =
    typeof subjectKey === "function"
      ? (subjectKey as (s: unknown) => string | number)(subject)
      : (subjectKey as string | number);
  return `${entry.id}:${discriminator}`;
}

/**
 * Render every panel a group resolves for its subject, ordered, each with the
 * subject supplied as a `subject` prop **and** via `provide` (readable with
 * {@link usePanelSubject}).
 *
 * - `group` — the {@link PanelGroupHandle} from `definePanelGroup`.
 * - `subject` — the value the panels key on; `null` / `undefined` renders the
 *   `#empty` slot (or nothing).
 * - `subjectKey` — optional discriminator folded into each rendered panel's key
 *   so switching subjects remounts panel content rather than reusing a stale
 *   instance. Re-read on every render: pass a `(subject) => string | number` to
 *   have the outlet derive it from the current subject, or a string you compute
 *   from the subject in the caller and update as the selection changes (a literal
 *   constant never varies, so it won't drive remounts). Absent = key on
 *   `entry.id` alone.
 *
 * Slots:
 * - `#empty` — shown when no panel matches (or the subject is absent).
 * - `#wrap` — optional per-panel chrome; receives
 *   `{ entry, subject, children }` and must render `children` somewhere (e.g. a
 *   collapsible section shell).
 *
 * Each panel is wrapped in `ModuleErrorBoundary` (keyed by the panel id) so one
 * throwing panel can't take down the group.
 *
 * Authored with `defineComponent` + a render function (no SFC compiler in the
 * package build; see decision D4).
 */
export const PanelsOutlet = defineComponent({
  name: "PanelsOutlet",
  props: {
    group: { type: Object as PropType<PanelGroupHandle<unknown>>, required: true },
    // The `default` is cast to the prop's declared type so `ExtractPropTypes`
    // keeps `unknown`; an un-cast `default: null` collapses the inferred
    // `$props["subject"]` to `null`, which makes `<PanelsOutlet :subject="…">`
    // reject a real subject in a typed template (vue-tsc). See OverlayOutlet.
    subject: { type: null as unknown as PropType<unknown>, default: null as unknown },
    subjectKey: {
      type: null as unknown as PropType<string | ((subject: unknown) => string | number)>,
      default: undefined,
    },
    onDuplicate: {
      type: String as PropType<OnDuplicateComponentId>,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    // Every prop flows into `usePanels` as a getter so the computed tracks it —
    // reading `props.x` here in setup would freeze its mount-time value. The
    // subject is additionally provided as a computed so nested
    // `usePanelSubject()` stays reactive.
    const panels = usePanels<unknown>(
      () => props.group,
      () => props.subject,
      { onDuplicate: () => props.onDuplicate },
    );
    const subjectRef = computed(() => props.subject);
    provide(panelSubjectKey, subjectRef);

    return () => {
      const resolved = panels.value;
      if (resolved.length === 0) {
        return slots.empty ? slots.empty() : null;
      }
      return resolved.map((entry) => {
        const content: VNode = h(entry.component as Component, {
          ...entry.props,
          subject: props.subject,
        });
        const inner = slots.wrap
          ? slots.wrap({ entry, subject: props.subject, children: content })
          : content;
        return h(
          ModuleErrorBoundary,
          {
            key: keyFor(entry, props.subjectKey, props.subject),
            moduleId: entry.id,
            label: "Panel",
          },
          () => inner,
        );
      });
    };
  },
});
