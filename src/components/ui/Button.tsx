import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClass: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:brightness-95 focus-visible:outline-primary',
  secondary: 'bg-card text-ink border hover:bg-black/5 dark:hover:bg-white/5 focus-visible:outline-primary',
  ghost: 'text-muted hover:text-ink hover:bg-black/5 dark:hover:bg-white/5 focus-visible:outline-primary',
  danger: 'bg-danger text-white hover:brightness-95 focus-visible:outline-danger',
};

const sizeClass: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn('btn-base', variantClass[variant], sizeClass[size], className)} {...props} />;
});
