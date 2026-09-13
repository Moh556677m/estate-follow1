import React from 'react';

// Root-cause fix for "white screen" reports: React unmounts the ENTIRE
// component tree the moment any component throws during render, if nothing
// above it catches the error — a bug in one small, unrelated panel took
// down the whole app with nothing on screen at all, and no way for the
// site's own crash reporter (SiteIssuesReporter, which only sees
// window.onerror/unhandledrejection, not React's own render-phase errors)
// to have shown anything either. There was no Error Boundary anywhere in
// this app before this file.
//
// A class component is required here — React only recognizes
// getDerivedStateFromError/componentDidCatch on class components; there is
// no Hook equivalent.
//
// Wrapped around <Suspense><Routes>...</Routes></Suspense> in App.jsx, so
// this also catches a failed lazy() chunk load (e.g. the browser has an old
// tab open referencing a JS chunk filename that no longer exists after a
// new deploy replaced apps/web/dist — "ChunkLoadError" / "Failed to fetch
// dynamically imported module") — normally an unrecoverable white screen —
// and offers a one-click reload instead of leaving the user stuck on
// nothing.
const CHUNK_LOAD_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|ChunkLoadError|Loading chunk .* failed|error loading dynamically imported module/i;

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Best-effort: surface it the same way an uncaught window error would,
    // so it still reaches any console-based monitoring already in place.
    // Never throws itself — a logging failure must never block the
    // fallback UI below from rendering.
    try {
      console.error('ErrorBoundary caught a render error:', error, info?.componentStack);
    } catch {
      /* ignore */
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isChunkLoadError = CHUNK_LOAD_ERROR_PATTERN.test(String(error?.message || error));

    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-foreground">
            {isChunkLoadError ? 'A new version is available' : 'Something went wrong'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isChunkLoadError
              ? 'This page was updated since it was last loaded. Please reload to get the latest version.'
              : 'This part of the page ran into an unexpected error. Reloading usually fixes it — your data is safe.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Reload page
            </button>
            {!isChunkLoadError && (
              <button
                type="button"
                onClick={() => {
                  this.setState({ error: null });
                  try {
                    window.location.assign('/');
                  } catch {
                    /* ignore */
                  }
                }}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-accent"
              >
                Go to home
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
