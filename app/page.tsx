/**
 * Home page — a Server Component. No `'use client'`, no hooks, no JS shipped
 * to the browser for this route.
 *
 * This is the only page in the template. Replace it with the real application;
 * keep the folder conventions described in .github/instructions/.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Hello World</h1>
      <p className="text-muted mt-6 max-w-xl text-balance text-base sm:text-lg">
        This project is running successfully on Google Cloud Run.
      </p>
    </main>
  );
}
