import '@/styles/globals.css';

import type { Metadata, Viewport } from 'next';

import { env } from '@/lib/env';

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: {
    default: env.appName,
    template: `%s | ${env.appName}`,
  },
  description: 'Production-ready Next.js App Router template deployed on Google Cloud Run.',
  robots: {
    // Deployed previews should not be indexed. Flip this on for the real site.
    index: env.isProduction,
    follow: env.isProduction,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

/**
 * Root layout — a Server Component, and it must stay one.
 *
 * Adding `'use client'` here would turn the entire application into a client
 * bundle. Providers that need client state belong in their own
 * `'use client'` component rendered from here as a child.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
