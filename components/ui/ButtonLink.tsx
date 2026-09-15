import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { buttonClasses, type ButtonSize, type ButtonVariant } from '@/components/ui/Button';

export interface ButtonLinkProps extends Omit<ComponentProps<typeof Link>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * A link that looks like a button.
 *
 * Navigation must be an anchor: it has to be middle-clickable, copyable, and
 * announced as a link rather than a button. Sharing `buttonClasses` with
 * `Button` keeps the two visually identical without nesting one in the other.
 */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, block, className)} {...props}>
      {children}
    </Link>
  );
}
