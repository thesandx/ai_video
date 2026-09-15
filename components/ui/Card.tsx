import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type CardSurface = 'white' | 'cream' | 'peach' | 'mint' | 'yellow' | 'coral' | 'forest';

export interface CardProps {
  surface?: CardSurface;
  /** The design outlines most cards in 2px ink; full-bleed colour cards are not. */
  outlined?: boolean;
  /**
   * The small tracked uppercase label above the title. It is the one place the
   * design allows uppercase, and the one place it allows alpha (`opacity-85`).
   */
  eyebrow?: string;
  className?: string;
  children: ReactNode;
}

const SURFACES: Record<CardSurface, string> = {
  white: 'bg-white',
  cream: 'bg-cream',
  peach: 'bg-peach',
  mint: 'bg-mint',
  yellow: 'bg-yellow',
  coral: 'bg-coral',
  forest: 'bg-forest',
};

/** Surfaces dark enough to need white type rather than ink. */
const DARK_SURFACES: ReadonlySet<CardSurface> = new Set<CardSurface>(['coral', 'forest']);

/**
 * The rounded 20px panel the whole design is built from.
 *
 * Signature colours (`coral`, `forest`) and the pastels are whole-card surfaces
 * by design-system rule, never small accents or borders.
 */
export function Card({
  surface = 'white',
  outlined = true,
  eyebrow,
  className,
  children,
}: CardProps) {
  const isDark = DARK_SURFACES.has(surface);

  return (
    <div
      className={cn(
        'rounded-card p-6',
        SURFACES[surface],
        isDark ? 'text-white' : 'text-ink-2',
        outlined && 'border-ink-1 border-2',
        className,
      )}
    >
      {eyebrow ? (
        <p
          className={cn(
            'font-text mb-3 text-xs font-medium tracking-[0.08em] uppercase opacity-85',
            isDark ? 'text-white' : 'text-ink-1',
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      {children}
    </div>
  );
}
