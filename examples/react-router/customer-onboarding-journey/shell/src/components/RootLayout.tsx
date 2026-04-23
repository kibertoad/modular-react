import type { ReactNode } from "react";

export interface RootLayoutProps {
  readonly children: ReactNode;
}

export function RootLayout({ children }: RootLayoutProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <header
        style={{
          padding: "0.75rem 1.5rem",
          borderBottom: "1px solid #e2e8f0",
          backgroundColor: "white",
        }}
      >
        <span style={{ fontSize: "0.875rem", color: "#4a5568" }}>
          Customer Onboarding Journey — <code>@modular-react/journeys</code> example
        </span>
      </header>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>{children}</div>
    </div>
  );
}
