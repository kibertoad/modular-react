import {
  Component,
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type { ModuleDescriptor } from "@modular-react/core";
import { ModuleErrorBoundary } from "@modular-react/react";

import { getInternals } from "./runtime.js";
import { useJourneyContext } from "./provider.js";
import type { InstanceId, JourneyRuntime, JourneyStep, TerminalOutcome } from "./types.js";

export type JourneyStepErrorPolicy = "abort" | "retry" | "ignore";

/** Maximum automatic retries before falling back to `abort`. */
const DEFAULT_RETRY_CAP = 2;

export interface JourneyOutletProps {
  /**
   * Runtime to drive the outlet against. Optional when a `<JourneyProvider>`
   * is mounted above — the outlet reads the runtime from context in that
   * case. Explicit prop overrides context, so one outlet can reach a
   * different runtime when needed.
   */
  readonly runtime?: JourneyRuntime;
  readonly instanceId: InstanceId;
  /**
   * Module descriptors the outlet resolves step components against.
   * Optional — when omitted, the outlet pulls the descriptors the runtime
   * was constructed with (the common case).
   */
  readonly modules?: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
  readonly loadingFallback?: ReactNode;
  readonly onFinished?: (outcome: TerminalOutcome) => void;
  readonly onStepError?: (err: unknown, ctx: { step: JourneyStep }) => JourneyStepErrorPolicy;
  /**
   * Cap on `retry` responses before the outlet falls back to `abort`. The
   * counter increments on every retry from `onStepError` and is never reset,
   * so a step that causes a downstream step to also throw cannot bypass the
   * cap by bumping the step token. Default: 2.
   */
  readonly retryLimit?: number;
}

/**
 * Renders the current step of a journey instance. Host-agnostic — works in
 * a tab, modal, route element, or plain `<div>`. On unmount while active,
 * the instance is abandoned (deferred by a microtask so React 18/19
 * StrictMode's simulated mount/unmount/mount cycle does not tear the
 * instance down on its first visit).
 */
export function JourneyOutlet(props: JourneyOutletProps): ReactNode {
  const context = useJourneyContext();
  const {
    runtime: runtimeProp,
    instanceId,
    modules: modulesProp,
    loadingFallback,
    onFinished,
    onStepError,
    retryLimit = DEFAULT_RETRY_CAP,
  } = props;

  const runtime = runtimeProp ?? context?.runtime;
  if (!runtime) {
    throw new Error(
      "[@modular-react/journeys] <JourneyOutlet> needs a runtime. Either pass `runtime` or mount a <JourneyProvider>.",
    );
  }

  const instance = useInstanceSnapshot(runtime, instanceId);
  const internals = getInternals(runtime);
  const modules = modulesProp ?? internals.__moduleMap;
  const [retryKey, setRetryKey] = useState(0);

  // Abandon on unmount when still active OR still loading. StrictMode in dev
  // fires the cleanup synchronously and then remounts — deferring the abandon
  // one microtask and re-checking "did I re-mount?" via a ref keeps the
  // journey alive through that dance. Production single-mount behavior is
  // unchanged.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => {
        if (mountedRef.current) return;
        const record = internals.__getRecord(instanceId);
        if (record && (record.status === "active" || record.status === "loading")) {
          runtime.end(instanceId, { reason: "unmounted" });
        }
      });
    };
  }, [runtime, instanceId, internals]);

  // Fire onFinished exactly once on terminal.
  const finishedFiredRef = useRef(false);
  useEffect(() => {
    if (!instance) return;
    if (instance.status !== "completed" && instance.status !== "aborted") return;
    if (finishedFiredRef.current) return;
    finishedFiredRef.current = true;
    onFinished?.({
      status: instance.status,
      payload: instance.terminalPayload,
      instanceId: instance.id,
      journeyId: instance.journeyId,
    });
  }, [instance, onFinished]);

  if (!instance) return null;
  if (instance.status === "loading") return loadingFallback ?? null;
  if (instance.status === "completed" || instance.status === "aborted") return null;

  const step = instance.step;
  if (!step) return null;

  const mod = modules[step.moduleId];
  const entry = mod?.entryPoints?.[step.entry];
  if (!mod || !entry) {
    return createElement(
      "div",
      { style: { padding: "1rem", color: "#c53030" } },
      `Journey outlet: no entry "${step.moduleId}.${step.entry}" on the registered modules.`,
    );
  }

  const record = internals.__getRecord(instanceId)!;
  const reg = internals.__getRegistered(instance.journeyId)!;
  const { exit, goBack } = internals.__bindStepCallbacks(record, reg);

  const handleError = (err: unknown): void => {
    let policy = onStepError?.(err, { step }) ?? "abort";
    if (policy === "retry") {
      // The retry counter lives on the runtime record (not a ref) so it
      // survives a transition side-effect that advances stepToken mid-retry:
      // a step that throws during render and calls `exit()` in cleanup would
      // otherwise reset the budget on every hop.
      if (record.retryCount >= retryLimit) {
        policy = "abort";
      } else {
        record.retryCount += 1;
      }
    }
    if (policy === "abort") {
      runtime.end(instanceId, { reason: "component-error", error: err });
      return;
    }
    if (policy === "retry") {
      setRetryKey((k) => k + 1);
    }
    // 'ignore' — leave the boundary UI in place until the user navigates away
  };

  const StepComponent = entry.component as React.ComponentType<any>;
  const stepKey = `${record.stepToken}:${retryKey}`;

  return createElement(
    StepErrorBoundary,
    { moduleId: step.moduleId, onError: handleError, key: stepKey, children: null },
    createElement(StepComponent, {
      input: step.input,
      exit,
      goBack,
    }),
  );
}

function useInstanceSnapshot(runtime: JourneyRuntime, instanceId: InstanceId) {
  const subscribe = useMemo(
    () => (listener: () => void) => runtime.subscribe(instanceId, listener),
    [runtime, instanceId],
  );
  const getSnapshot = () => runtime.getInstance(instanceId);
  const getServerSnapshot = getSnapshot;
  const instance = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return instance;
}

interface StepErrorBoundaryProps {
  readonly moduleId: string;
  readonly onError: (err: unknown) => void;
  readonly children: ReactNode;
}

interface StepErrorBoundaryState {
  readonly error: unknown;
}

class StepErrorBoundary extends Component<StepErrorBoundaryProps, StepErrorBoundaryState> {
  override state: StepErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): StepErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return createElement(
        ModuleErrorBoundary,
        { moduleId: this.props.moduleId, children: null },
      );
    }
    return this.props.children;
  }
}
