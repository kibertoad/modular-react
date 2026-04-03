import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ModuleErrorBoundary } from "./error-boundary.js";

function ThrowingChild({ error }: { error: Error }) {
  throw error;
}

describe("ModuleErrorBoundary", () => {
  it("renders children when no error", () => {
    const { getByText } = render(
      <ModuleErrorBoundary moduleId="test">
        <div>All good</div>
      </ModuleErrorBoundary>,
    );
    expect(getByText("All good")).toBeTruthy();
  });

  it("renders default error UI on error", () => {
    // Suppress React's console.error for expected error boundary logs
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getByText } = render(
      <ModuleErrorBoundary moduleId="billing">
        <ThrowingChild error={new Error("something broke")} />
      </ModuleErrorBoundary>,
    );
    expect(getByText(/billing/)).toBeTruthy();
    expect(getByText(/something broke/)).toBeTruthy();

    spy.mockRestore();
  });

  it("renders custom fallback on error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getByText } = render(
      <ModuleErrorBoundary moduleId="billing" fallback={<div>Custom fallback</div>}>
        <ThrowingChild error={new Error("boom")} />
      </ModuleErrorBoundary>,
    );
    expect(getByText("Custom fallback")).toBeTruthy();

    spy.mockRestore();
  });
});
