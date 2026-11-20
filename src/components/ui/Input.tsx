import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, id, ...props },
  ref,
) {
  const inputId = id ?? (label ? `input-${label.replace(/\s+/g, '-')}` : undefined);
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-muted">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        className={cn(
          'w-full rounded-xl border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted/70',
          'focus:outline focus:outline-2 focus:outline-primary/60',
          error && 'outline outline-2 outline-danger/60',
          className,
        )}
        style={{ borderColor: 'var(--border)' }}
        {...props}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
});
