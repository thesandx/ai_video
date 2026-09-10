import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-muted font-mono text-sm">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted mt-4 max-w-md text-balance">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        href="/"
        className="border-border mt-8 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:border-current"
      >
        Back to home
      </Link>
    </main>
  );
}
