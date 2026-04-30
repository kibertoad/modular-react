import { createRoot } from "react-dom/client";
import { createRegistry } from "@react-router-modules/runtime";
import { JourneyProvider, journeysPlugin } from "@modular-react/journeys";
import type { JourneyRuntime } from "@modular-react/journeys";
import type { AppDependencies, AppSlots } from "@example-rr-invoke/app-shared";

import checkoutReviewModule from "@example-rr-invoke/checkout-review-module";
import ageVerifyModule from "@example-rr-invoke/age-verify-module";
import checkoutConfirmModule from "@example-rr-invoke/checkout-confirm-module";
import { checkoutJourney } from "@example-rr-invoke/checkout-journey";
import { verifyIdentityJourney } from "@example-rr-invoke/verify-identity-journey";

import { RootLayout } from "./components/RootLayout.js";
import { Home } from "./components/Home.js";
import { checkoutPersistence, verifyIdentityPersistence } from "./persistence.js";

// One registry, three modules, two journeys (parent + child). The journeys
// plugin contributes manifest.journeys — the runtime that drives the
// invoke/resume linkage automatically.
const registry = createRegistry<AppDependencies, AppSlots>({
  slots: {},
}).use(journeysPlugin());

registry.register(checkoutReviewModule);
registry.register(ageVerifyModule);
registry.register(checkoutConfirmModule);

registry.registerJourney(checkoutJourney, {
  persistence: checkoutPersistence,
  // Demo telemetry — log every transition. Filter by `kind` to show how
  // invoke / resume hops are distinguished from ordinary step transitions.
  onTransition: (ev) => {
    const tag =
      ev.kind === "invoke"
        ? `invoke→${ev.child?.journeyId ?? "?"}`
        : ev.kind === "resume"
          ? `resume(${ev.resume ?? "?"}, ${ev.outcome?.status ?? "?"})`
          : "step";
    console.debug(`[journey ${ev.journeyId}] ${tag}`, {
      from: ev.from?.entry,
      to: ev.to?.entry,
      exit: ev.exit,
    });
  },
});

registry.registerJourney(verifyIdentityJourney, {
  persistence: verifyIdentityPersistence,
});

const { App, journeys } = registry.resolve({
  rootComponent: () => (
    <JourneyProvider runtime={journeys}>
      <RootLayout />
    </JourneyProvider>
  ),
  indexComponent: () => <Home runtime={journeys} />,
});

// `journeys` (the JourneyRuntime) is now ready for `runtime.start(handle, …)`.
// The Home component receives it via prop; in a larger shell you'd usually
// pull it from context (`useJourneyContext`) instead.
const _unusedRuntime: JourneyRuntime = journeys;
void _unusedRuntime;

createRoot(document.getElementById("root")!).render(<App />);
