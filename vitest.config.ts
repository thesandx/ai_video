import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Vitest is used instead of Jest because it resolves the same `tsconfig.json`
 * path aliases natively, needs no separate Babel transform, and starts fast
 * enough to run on every PR without a cache.
 *
 * Server Components that are `async` cannot be rendered by React Testing
 * Library today — test their data-fetching helpers in `lib/` or `services/`
 * directly and reserve component tests for Client Components and sync
 * Server Components. See docs/testing.md.
 */
export default defineConfig({
  plugins: [react()],
  // Reuses the `@/*` alias from tsconfig.json, so tests and application code
  // resolve imports identically. Native since Vite 7 — no plugin needed.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', 'coverage/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['app/**', 'components/**', 'hooks/**', 'lib/**', 'services/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts', '**/layout.tsx'],
    },
  },
});
