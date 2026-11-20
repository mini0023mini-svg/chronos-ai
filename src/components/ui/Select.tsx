import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, className, children, id, ...props },
  ref,
) {
  const selectId = id ?? (label ? `select-${label.replace(/\s+/g, '-')}` : undefined);
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium text-muted">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'w-full rounded-xl border bg-card px-3 py-2 text-sm text-ink',
          'focus:outline focus:outline-2 focus:outline-primary/60',
          className,
        )}
        style={{ borderColor: 'var(--border)' }}
        {...props}
      >
        {children}
      </select>
    </div>
  );
});
