import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from '@/app/page';

/**
 * Smoke test for the only page in the app.
 *
 * `HomePage` is a synchronous Server Component, so React Testing Library can
 * render it directly. Async Server Components cannot be rendered this way, so
 * test their data helpers in `lib/` or `services/` instead. See docs/testing.md.
 */
describe('HomePage', () => {
  it('renders the heading', () => {
    render(<HomePage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Study a reel, then shoot your own' }),
    ).toBeInTheDocument();
  });

  it('explains that the script is original work', () => {
    render(<HomePage />);
    expect(screen.getByText(/It does not borrow words, captions or music\./)).toBeInTheDocument();
  });

  it('offers the reel link field', () => {
    render(<HomePage />);
    expect(screen.getByLabelText('Reel link')).toBeInTheDocument();
  });
});
