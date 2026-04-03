import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  moduleId: string;
  fallback?: ReactNode;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ModuleErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[@modular-react/react] Module "${this.props.moduleId}" encountered an error:`,
      error,
      info,
    );
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          style={{
            padding: "1rem",
            border: "1px solid #e53e3e",
            borderRadius: "0.5rem",
            margin: "1rem",
          }}
        >
          <h3 style={{ color: "#e53e3e", margin: "0 0 0.5rem 0" }}>
            Module &quot;{this.props.moduleId}&quot; encountered an error
          </h3>
          <pre style={{ fontSize: "0.875rem", color: "#718096", whiteSpace: "pre-wrap" }}>
            {this.state.error?.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
