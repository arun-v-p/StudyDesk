import { Link } from 'react-router-dom';
import type { KeyboardEvent, ReactNode } from 'react';

/** The one card treatment. Replaces ~21 copies of the same class string. */
export function Card({
  children,
  className = '',
  interactive = false,
  as: Tag = 'section',
  onClick,
  onKeyDown,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  as?: 'section' | 'div' | 'article' | 'li';
  onClick?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  return (
    <Tag
      className={`card ${interactive ? 'card--interactive' : ''} ${className}`.trim()}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  action,
  badge,
}: {
  title: ReactNode;
  action?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <h2 className="section-title">{title}</h2>
      {badge}
      {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
    </div>
  );
}

/** Semantic chip — one scale, used for priority, status and tags alike. */
export type ChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const CHIP_CLASS: Record<ChipTone, string> = {
  neutral: 'chip--neutral',
  accent: 'chip--accent',
  success: 'chip--success',
  warning: 'chip--warning',
  danger: 'chip--danger',
  info: 'chip--info',
};

export function Chip({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  return <span className={`chip ${CHIP_CLASS[tone]} ${className}`.trim()}>{children}</span>;
}

/**
 * In-text navigation link.
 *
 * Pass `to` for client-side routing, or `onClick` for an in-page action. Never
 * nest this inside another <a> — that produces invalid HTML and a dead click.
 */
const ACTION_LINK_CLASS =
  'inline-flex items-center gap-0.5 text-xs font-semibold text-accent transition-colors hover:text-accent-hover hover:underline';

export function ActionLink({
  children,
  to,
  onClick,
}: {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
}) {
  if (to) {
    return (
      <Link to={to} className={ACTION_LINK_CLASS}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={ACTION_LINK_CLASS}>
      {children}
    </button>
  );
}
