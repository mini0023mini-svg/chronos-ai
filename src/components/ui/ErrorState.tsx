import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from './Button';
import { useI18n } from '@/hooks/useI18n';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[180px] w-full flex-col items-center justify-center gap-3 rounded-card border border-danger/30 bg-danger/5 p-8 text-center" role="alert">
      <AlertCircle className="h-7 w-7 text-danger" aria-hidden />
      <p className="text-sm font-medium text-ink">{title ?? t('common.error')}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
