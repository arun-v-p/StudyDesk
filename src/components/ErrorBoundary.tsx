import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The original had none: any render-time throw blanked the whole page with no
 * recovery but clearing site data by hand. Wrap each route so one broken panel
 * cannot take down the shell.
 */
interface Props {
  children: ReactNode;
  label?: string;
  onError?: (error: Error, info: ErrorInfo) => void;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[studydesk] ${this.props.label ?? 'panel'} crashed`, error, info.componentStack);
    this.props.onError?.(error, info);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" className="card border-danger">
        <h2 className="text-fg text-base font-semibold">
          {this.props.label ? `${this.props.label} failed to load` : 'Something went wrong'}
        </h2>
        <p className="text-muted mt-2 text-sm">
          Your saved data is still in this browser — nothing was deleted.
        </p>
        <pre className="border-border bg-sunken text-2xs text-subtle mt-4 max-h-32 overflow-auto rounded-md border p-3">
          {error.message}
        </pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => window.location.reload()}>
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
