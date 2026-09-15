import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretches to the container width, as the design's form CTAs do. */
  block?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Two things the source design system is explicit about, and both are easy to
 * get wrong: the primary fill is near-black `ink-1` and NEVER the link blue,
 * and there are no hover states, only default and active/pressed.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-ink-1 text-white border-ink-1 active:bg-ink-press active:border-ink-press disabled:bg-neutral-500 disabled:border-neutral-500',
  secondary:
    'bg-white text-ink-1 border-ink-1 active:bg-cream disabled:text-neutral-500 disabled:border-neutral-300',
};

/** Sizes are floored at 44px so every control clears the touch-target minimum. */
const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-[52px] px-6 text-base',
  sm: 'min-h-[44px] px-4 text-sm',
};

/**
 * The shared pill styling.
 *
 * Exported so `ButtonLink` can render a real anchor that looks identical. A
 * button wrapping a link is invalid HTML and breaks keyboard navigation, so
 * navigation uses `ButtonLink` and actions use `Button`.
 */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  block = false,
  className?: string,
): string {
  return cn(
    'font-text inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill border-2 text-center font-medium transition-colors',
    'disabled:cursor-not-allowed',
    VARIANTS[variant],
    SIZES[size],
    block && 'w-full',
    className,
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, block, className)} {...props}>
      {children}
    </button>
  );
}
