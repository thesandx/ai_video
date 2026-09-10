import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * Global test setup, loaded by `vitest.config.ts` before every test file.
 */

// Unmount anything rendered so state cannot leak between test files.
afterEach(() => {
  cleanup();
});

// jsdom does not implement matchMedia; components reading it would throw.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});
