import type { ReactNode } from 'react';
import { useI18n } from '@/hooks/useI18n';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[180px] w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed p-8 text-center" style={{ borderColor: 'var(--border)' }}>
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-xl text-primary">
        ◇
      </div>
      <p className="text-sm font-medium text-ink">{title ?? t('common.empty')}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
