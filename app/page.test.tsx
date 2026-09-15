import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from '@/app/page';

/**
 * Smoke test for the studio page.
 *
 * `HomePage` is a synchronous Server Component, so React Testing Library can
 * render it directly. It renders one client component, `StudioApp`, whose own
 * behaviour is covered by testing the pure rules it calls: `lib/pipeline.ts`
 * and `lib/preflight.ts`. See docs/testing.md.
 */
describe('HomePage', () => {
  it('renders the heading', () => {
    render(<HomePage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Reel in, animated reel out' }),
    ).toBeInTheDocument();
  });

  it('states that every stage waits for approval', () => {
    render(<HomePage />);
    expect(screen.getByText(/Every stage waits for your approval/)).toBeInTheDocument();
  });

  it('says the run does not reach the expensive stage until the checks pass', () => {
    render(<HomePage />);
    expect(screen.getByText(/until the checks pass/)).toBeInTheDocument();
  });
});
