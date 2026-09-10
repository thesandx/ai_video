import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from '@/app/page';

/**
 * Smoke test for the only page in the template.
 *
 * `HomePage` is a synchronous Server Component, so React Testing Library can
 * render it directly. Async Server Components cannot be rendered this way —
 * test their data helpers in `lib/` or `services/` instead. See docs/testing.md.
 */
describe('HomePage', () => {
  it('renders the heading', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Hello World' })).toBeInTheDocument();
  });

  it('states where the application is running', () => {
    render(<HomePage />);
    expect(
      screen.getByText('This project is running successfully on Google Cloud Run.'),
    ).toBeInTheDocument();
  });
});
