import { createContext, useContext, useMemo } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  resolvePanels,
  type OnDuplicateComponentId,
  type PanelEntry,
  type PanelGroupHandle,
} from "@modular-react/core";
import { ModuleErrorBoundary } from "./error-boundary.js";
import { useSlots } from "./slots-context.js";

/**
 * React host for the framework-neutral **subject-keyed panels** primitive (see
 * `resolvePanels` / `definePanelGroup` in `@modular-react/core`). A panel group
 * is a named region whose module-contributed panels are selected by a runtime
 * *subject* and rendered **all-matching**, ordered — the render-all counterpart
 * to the pick-one component-pairing surface.
 *
 * `usePanels` is a `useMemo` over the slots context + the subject; the engine
 * resolver is pure, so the hook is thin. `<PanelsOutlet>` renders every
 * resolved panel with the subject injected (as a `subject` prop **and** via
 * context, readable with {@link usePanelSubject}), each wrapped in
 * `ModuleErrorBoundary`.
 */

// Sentinel default so a read outside a `<PanelsOutlet>` is a loud error rather
// than a silently-`undefined` subject that a valid `null` subject can't be told
// apart from.
const NO_SUBJECT = Symbol("modular-react.no-panel-subject");

/**
 * Context carrying the current panel subject, set by {@link PanelsOutlet}.
 * Prefer {@link usePanelSubject} — it throws outside the outlet instead of
 * handing back the private sentinel default.
 */
export const PanelSubjectContext = createContext<unknown>(NO_SUBJECT);

/**
 * Read the subject of the enclosing {@link PanelsOutlet}. Throws when called
 * outside a `<PanelsOutlet>` so a missing host is a loud error.
 *
 * @example
 * ```tsx
 * const block = usePanelSubject<BoardBlock>()
 * return <h3>{block.label}</h3>
 * ```
 */
export function usePanelSubject<TSubject>(): TSubject {
  const subject = useContext(PanelSubjectContext);
  if (subject === NO_SUBJECT) {
    throw new Error(
      "[@modular-react/react] usePanelSubject must be used inside a <PanelsOutlet> " +
        "(the outlet provides the current panel subject).",
    );
  }
  return subject as TSubject;
}

/**
 * Resolve a panel group against a subject. Reads the group's slot key from the
 * slots context and runs the pure `resolvePanels`, memoized on the entries, the
 * subject, and the duplicate stance — so it recomputes when the contributions
 * or the subject change but returns a stable array otherwise.
 *
 * A `null` / `undefined` subject resolves to no panels.
 *
 * @example
 * ```tsx
 * const panels = usePanels(inspectorPanels, selectedBlock)
 * ```
 */
// Stable identity for "this group has no contributions", so the `useMemo`
// below doesn't see a fresh `[]` on every render (which would defeat the memo
// and hand consumers an unstable empty result).
const NO_ENTRIES: readonly PanelEntry<never>[] = [];

export function usePanels<TSubject>(
  group: PanelGroupHandle<TSubject>,
  subject: TSubject | null | undefined,
  opts?: { onDuplicate?: OnDuplicateComponentId },
): readonly PanelEntry<TSubject>[] {
  const slots = useSlots<Record<string, readonly PanelEntry<TSubject>[]>>();
  const entries = (slots[group.slotKey] ?? NO_ENTRIES) as readonly PanelEntry<TSubject>[];
  const onDuplicate = opts?.onDuplicate;
  return useMemo(
    () => resolvePanels(entries, subject, onDuplicate ? { onDuplicate } : undefined),
    [entries, subject, onDuplicate],
  );
}

/** Per-panel chrome render-prop argument for {@link PanelsOutletProps.wrap}. */
export interface PanelWrapArgs<TSubject> {
  readonly entry: PanelEntry<TSubject>;
  readonly subject: TSubject;
  readonly children: ReactNode;
}

export interface PanelsOutletProps<TSubject> {
  /** The {@link PanelGroupHandle} from `definePanelGroup`. */
  readonly group: PanelGroupHandle<TSubject>;
  /** The value the panels key on; `null` / `undefined` renders `empty`. */
  readonly subject: TSubject | null | undefined;
  /**
   * Optional string, or `(subject) => string | number`, folded into each
   * rendered panel's React key so switching subjects remounts panel content
   * rather than reusing a stale instance. Absent = key on `entry.id` alone.
   */
  readonly subjectKey?: string | ((subject: TSubject) => string | number);
  /** Duplicate-id stance forwarded to `resolvePanels` (default: throw). */
  readonly onDuplicate?: OnDuplicateComponentId;
  /** Rendered when no panel matches (or the subject is absent). */
  readonly empty?: ReactNode;
  /**
   * Optional per-panel chrome; receives `{ entry, subject, children }` and must
   * render `children` somewhere (e.g. a collapsible section shell).
   */
  readonly wrap?: (args: PanelWrapArgs<TSubject>) => ReactNode;
}

/**
 * Render every panel a group resolves for its subject, ordered, each with the
 * subject supplied as a `subject` prop **and** via context (readable with
 * {@link usePanelSubject}). Each panel is wrapped in `ModuleErrorBoundary`
 * (keyed by the panel id) so one throwing panel can't take down the group.
 *
 * @example
 * ```tsx
 * <PanelsOutlet group={inspectorPanels} subject={selectedBlock} subjectKey={(b) => b.id}>
 *   {/* empty / wrap via props *\/}
 * </PanelsOutlet>
 * ```
 */
export function PanelsOutlet<TSubject>({
  group,
  subject,
  subjectKey,
  onDuplicate,
  empty,
  wrap,
}: PanelsOutletProps<TSubject>): ReactNode {
  const panels = usePanels(group, subject, onDuplicate ? { onDuplicate } : undefined);
  if (panels.length === 0) return empty ?? null;

  // Past the length guard the subject is present (a null subject resolves to no
  // panels), so the `as TSubject` casts below are sound.
  const present = subject as TSubject;

  return (
    <PanelSubjectContext value={subject}>
      {panels.map((entry) => {
        const Component = entry.component as ComponentType<Record<string, unknown>>;
        const content = <Component {...entry.props} subject={present} />;
        const inner = wrap ? wrap({ entry, subject: present, children: content }) : content;
        const key =
          subjectKey === undefined
            ? entry.id
            : `${entry.id}:${typeof subjectKey === "function" ? subjectKey(present) : subjectKey}`;
        return (
          <ModuleErrorBoundary key={key} moduleId={entry.id} label="Panel">
            {inner}
          </ModuleErrorBoundary>
        );
      })}
    </PanelSubjectContext>
  );
}
