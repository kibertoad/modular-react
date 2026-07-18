import { useJourneyContext } from "@modular-vue/journeys";
import { setupWizardHandle } from "@example-vue-nuxt-modal/setup-wizard-journey";
import { useUiStore } from "../stores/ui";

/**
 * Opening/closing the modal-hosted journey.
 *
 * `useJourneyContext()` resolves the runtime that `installModularApp` threaded
 * app-wide (via the journeys plugin's `appProvides`) — no `<JourneyProvider>`
 * anywhere. That this composable, called from an ordinary page component,
 * finds the runtime is itself the proof that app-level threading works.
 *
 * `runtime.start(id, input)` is **idempotent under the persistence adapter**:
 * the same frame resolves to the same instance, so reopening resumes rather
 * than restarting. Must be called in a component `setup()` (it injects).
 */
export function useWizardControls() {
  const ctx = useJourneyContext();
  const ui = useUiStore();

  function open(frameId: string) {
    if (!ctx) {
      throw new Error(
        "No journey runtime in context — is the modular client plugin (installModularApp) wired?",
      );
    }
    ui.frameId = frameId;
    ui.instanceId = ctx.runtime.start(setupWizardHandle.id, { frameId });
    ui.isOpen = true;
  }

  return { open };
}
