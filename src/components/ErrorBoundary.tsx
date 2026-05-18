import React from "react";

type State = { hasError: boolean; error?: Error };

export default class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, State> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    // TODO: hook into your telemetry service (Sentry, Datadog, etc.)
    // console.error("ErrorBoundary caught", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-white border border-rose-100 rounded text-rose-700">
          <h2 className="font-semibold">Something went wrong</h2>
          <p className="text-sm text-rose-700">An unexpected error occurred while rendering this page.</p>
          <details className="mt-2 text-xs text-rose-600">
            <summary>Show error</summary>
            <pre className="whitespace-pre-wrap">{String(this.state.error)}</pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}
