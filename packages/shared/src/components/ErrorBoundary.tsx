import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render crash so one broken page does not blank the whole app.
 *
 * Without this a single thrown error in any page left the salesman looking at a
 * white screen with no way back — mid-bill, with a customer waiting, that is the
 * worst possible failure mode. The reset button re-mounts the tree, which recovers from a
 * transient bad state; the reload is there for when it does not.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No error-reporting service is wired up yet; the console is what a
    // developer or a support call actually has access to.
    console.error('Unhandled render error', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <div className="w-full max-w-lg rounded-xl border border-border bg-card p-8 shadow-sm">
          <AlertTriangle className="mb-3 h-8 w-8 text-destructive" />
          <h1 className="text-xl font-bold">Something went wrong on this page</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing you had already saved is affected. Try again, and if it keeps happening, note
            what you were doing and reload.
          </p>

          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
            {error.message}
          </pre>

          <div className="mt-5 flex flex-wrap gap-2">
            <button className="btn" onClick={this.reset}>
              <RotateCcw className="h-4 w-4" /> Try again
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
              onClick={() => window.location.reload()}
            >
              Reload the app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
