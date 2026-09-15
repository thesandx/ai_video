import '@/styles/globals.css';

import type { Metadata, Viewport } from 'next';
import { Huninn } from 'next/font/google';

import { env } from '@/lib/env';

/**
 * The display and text face for the whole design system.
 *
 * Huninn ships a single weight (400). Every 500 in the UI is synthesised by the
 * browser, which is the source design system's documented behaviour and not a
 * defect to fix. `next/font` has no metrics override for this family, so every
 * build logs `Failed to find font override values`. That warning is expected.
 */
const huninn = Huninn({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-huninn',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: {
    default: env.appName,
    template: `%s | ${env.appName}`,
  },
  description:
    'Study how a reel is built, then get an original shooting script that applies the same craft to your own idea.',
  robots: {
    // Deployed previews should not be indexed. Flip this on for the real site.
    index: env.isProduction,
    follow: env.isProduction,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The design commits to a single light look, so there is one theme colour.
  themeColor: '#ffffff',
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
    <html lang="en" className={huninn.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
