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
import type { InstanceId, JourneyRuntime, JourneyStep } from "./types.js";

export type JourneyStepErrorPolicy = "abort" | "retry" | "ignore";

export interface JourneyOutletProps {
  readonly runtime: JourneyRuntime;
  readonly instanceId: InstanceId;
  /**
   * Module descriptors the outlet resolves step components against. Usually
   * supplied by a thin shell-side wrapper that pulls from the registry; the
   * base outlet stays registry-agnostic.
   */
  readonly modules: Readonly<Record<string, ModuleDescriptor<any, any, any, any>>>;
  readonly loadingFallback?: ReactNode;
  readonly onFinished?: (outcome: {
    readonly status: "completed" | "aborted";
    readonly payload: unknown;
  }) => void;
  readonly onStepError?: (err: unknown, ctx: { step: JourneyStep }) => JourneyStepErrorPolicy;
}

/**
 * Renders the current step of a journey instance. Host-agnostic — works in
 * a tab, modal, route element, or plain `<div>`. On unmount while active,
 * the instance is abandoned.
 */
export function JourneyOutlet(props: JourneyOutletProps): ReactNode {
  const { runtime, instanceId, modules, loadingFallback, onFinished, onStepError } = props;

  const instance = useInstanceSnapshot(runtime, instanceId);
  const internals = getInternals(runtime);
  const [retryKey, setRetryKey] = useState(0);

  // Abandon on unmount when still active.
  useEffect(() => {
    return () => {
      const record = internals.__getRecord(instanceId);
      if (record && record.status === "active") {
        runtime.end(instanceId, { reason: "unmounted" });
      }
    };
    // Deliberately only bound to (runtime, instanceId): modules/fallback/etc.
    // changing shouldn't schedule a phantom abandon.
  }, [runtime, instanceId, internals]);

  // Fire onFinished exactly once on terminal.
  const finishedFiredRef = useRef(false);
  useEffect(() => {
    if (!instance) return;
    if (instance.status !== "completed" && instance.status !== "aborted") return;
    if (finishedFiredRef.current) return;
    finishedFiredRef.current = true;
    onFinished?.({ status: instance.status, payload: extractTerminalPayload(instance) });
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
    const policy = onStepError?.(err, { step }) ?? "abort";
    if (policy === "abort") {
      runtime.end(instanceId, { reason: "component-error", error: err });
      return;
    }
    if (policy === "retry") {
      setRetryKey((k) => k + 1);
    }
    // 'ignore' — leave the boundary UI in place until user navigates away
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

function extractTerminalPayload(instance: ReturnType<JourneyRuntime["getInstance"]>): unknown {
  // The terminal payload lives on the transition result, not the instance.
  // In the current runtime we don't surface it — callers that need richer
  // terminal context should subscribe to `onComplete` / `onAbort` on the
  // journey definition. Return the last step for diagnostic context.
  return instance?.history[instance.history.length - 1] ?? null;
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
