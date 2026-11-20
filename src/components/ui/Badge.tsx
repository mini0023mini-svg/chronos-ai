import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

const toneClass: Record<BadgeTone, string> = {
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/20 text-[#5f8668] dark:text-success',
  warning: 'bg-warning/25 text-[#9a7a2f] dark:text-warning',
  danger: 'bg-danger/20 text-[#b26060] dark:text-danger',
  neutral: 'bg-muted/15 text-muted',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', toneClass[tone], className)}
      {...props}
    />
  );
}
