import type { ReactNode } from 'react';

/**
 * Empty state with an icon, a value statement and a primary action.
 *
 * The live site currently shows a bare grey sentence in every panel — the first
 * thing any visitor sees. This is the cheapest credibility win available.
 */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  compact = false,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`text-center ${compact ? 'py-8' : 'py-12'}`}>
      <div
        aria-hidden="true"
        className={`bg-accent-soft text-accent mx-auto grid place-items-center rounded-2xl ${
          compact ? 'h-12 w-12' : 'h-16 w-16'
        }`}
      >
        {icon}
      </div>
      <h3 className={`text-fg mt-4 font-semibold ${compact ? 'text-sm' : 'text-base'}`}>{title}</h3>
      {description && (
        <p className="text-muted mx-auto mt-1.5 max-w-sm text-sm leading-relaxed">{description}</p>
      )}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
