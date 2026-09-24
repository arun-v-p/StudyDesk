/**
 * IconButton.
 *
 * `aria-label` is a REQUIRED prop, so TypeScript refuses to compile an unnamed
 * icon button. The audited build had 31 of them and zero accessible names.
 *
 * Hit area is 40px (WCAG 2.5.8 minimum is 24px). Pair with the `.row-actions`
 * class so the control is reachable on touch, not just on hover.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  tone?: 'default' | 'danger';
  size?: 'sm' | 'md';
  children: ReactNode;
}

export function IconButton({
  tone = 'default',
  size = 'md',
  className = '',
  children,
  ...rest
}: IconButtonProps) {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const toneCls =
    tone === 'danger'
      ? 'text-subtle hover:bg-danger-soft hover:text-danger'
      : 'text-subtle hover:bg-raised hover:text-fg';
  return (
    <button
      type="button"
      className={`inline-grid shrink-0 place-items-center rounded-md border border-transparent transition-colors ${dim} ${toneCls} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
