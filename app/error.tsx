'use client';

import { useEffect } from 'react';

/**
 * Route-segment error boundary.
 *
 * Must be a Client Component — React needs `componentDidCatch` semantics and an
 * interactive retry. This is one of the few legitimate `'use client'` files in
 * the template.
 *
 * Note: `error.message` is redacted to a generic string in production builds by
 * Next.js, and only `error.digest` is preserved. Search Cloud Logging for that
 * digest to find the real server-side stack trace.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side errors do not reach the server logger; forward them to an
    // error tracker here (Sentry, Cloud Error Reporting) in a real project.
    console.error('Unhandled application error', error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-muted mt-4 max-w-md text-balance">
        An unexpected error occurred. The team has been notified.
      </p>
      {error.digest ? (
        <p className="text-muted mt-2 font-mono text-xs">Reference: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="border-border mt-8 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:border-current"
      >
        Try again
      </button>
    </main>
  );
}
