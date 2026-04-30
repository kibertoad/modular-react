import { createRoot } from "react-dom/client";
import { Outlet } from "@tanstack/react-router";
import { createRegistry } from "@tanstack-react-modules/runtime";
import { JourneyProvider, journeysPlugin } from "@modular-react/journeys";
import type { AppDependencies, AppSlots } from "@example-tsr-invoke/app-shared";

import checkoutReviewModule from "@example-tsr-invoke/checkout-review-module";
import ageVerifyModule from "@example-tsr-invoke/age-verify-module";
import checkoutConfirmModule from "@example-tsr-invoke/checkout-confirm-module";
import { checkoutJourney } from "@example-tsr-invoke/checkout-journey";
import { verifyIdentityJourney } from "@example-tsr-invoke/verify-identity-journey";

import { Home } from "./components/Home.js";
import { checkoutPersistence, verifyIdentityPersistence } from "./persistence.js";

// One registry, three modules, two journeys (parent + child). Identical
// shape to the React Router variant — only the surrounding router is
// different. The journeys plugin contributes manifest.journeys.
const registry = createRegistry<AppDependencies, AppSlots>({
  slots: {},
}).use(journeysPlugin());

registry.register(checkoutReviewModule);
registry.register(ageVerifyModule);
registry.register(checkoutConfirmModule);

registry.registerJourney(checkoutJourney, {
  persistence: checkoutPersistence,
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
      <Outlet />
    </JourneyProvider>
  ),
  indexComponent: () => <Home runtime={journeys} />,
});

createRoot(document.getElementById("root")!).render(<App />);
