import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface CalloutProps {
  title?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A cream notice band for an explanation or a limitation.
 *
 * Separate from `Card` because it carries no eyebrow and sits inline in a
 * reading flow rather than acting as a panel in a grid.
 */
export function Callout({ title, className, children }: CalloutProps) {
  return (
    <div className={cn('bg-cream border-ink-1 rounded-card border-2 p-5', className)}>
      {title ? <p className="text-ink-1 mb-2 text-sm font-medium">{title}</p> : null}
      <div className="text-ink-2 text-sm">{children}</div>
    </div>
  );
}
