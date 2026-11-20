import { useI18n } from '@/hooks/useI18n';

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[160px] w-full flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      <span className="text-sm text-muted">{label ?? t('common.loading')}</span>
    </div>
  );
}
