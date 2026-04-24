/**
 * Growth-team journeys. Nothing in the framework requires one journey per
 * package — a cohesive same-domain set lives together, each in its own
 * file so ownership and diff scope stay focused.
 */

export {
  customerOnboardingJourney,
  customerOnboardingHandle,
  type CustomerOnboardingJourney,
  type CustomerOnboardingHandle,
  type OnboardingInput,
  type OnboardingState,
} from "./customer-onboarding.js";

export {
  planSwitchJourney,
  planSwitchHandle,
  type PlanSwitchHandle,
  type PlanSwitchInput,
} from "./plan-switch.js";

export {
  quickBillJourney,
  quickBillHandle,
  type QuickBillHandle,
  type QuickBillInput,
} from "./quick-bill.js";
