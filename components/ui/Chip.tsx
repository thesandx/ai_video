import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type ChipTone = 'ink' | 'peach' | 'mint' | 'yellow' | 'white';

export interface ChipProps {
  tone?: ChipTone;
  className?: string;
  children: ReactNode;
}

const TONES: Record<ChipTone, string> = {
  ink: 'bg-ink-1 text-white',
  peach: 'bg-peach text-ink-1',
  mint: 'bg-mint text-ink-1',
  yellow: 'bg-yellow text-ink-1',
  white: 'bg-white text-ink-2',
};

/**
 * A small static pill for a shot number, a timecode or a label.
 *
 * Deliberately NOT a button. Earlier versions of this design system shipped a
 * selectable chip; nothing in this product selects one, and a `<button>` that
 * does nothing is announced as an interactive control to a screen reader.
 * Reach for `Button` if an action is ever needed here.
 */
export function Chip({ tone = 'white', className, children }: ChipProps) {
  return (
    <span
      className={cn(
        'border-ink-1 rounded-pill font-text inline-flex items-center border-2 px-3 py-1 text-sm font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
