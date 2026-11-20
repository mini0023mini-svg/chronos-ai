import { Download, X } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';

/** 非阻塞式安装横幅：可安装时出现在内容顶部，用户可关闭（本次会话不再显示） */
export function InstallPrompt() {
  const { t } = useI18n();
  const { canInstall, install, dismiss } = usePwaInstall();
  if (!canInstall) return null;

  return (
    <div
      className={cn(
        'mb-4 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/8 px-4 py-3',
      )}
      role="status"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <Download className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{t('pwa.installTitle')}</p>
        <p className="text-xs text-muted">{t('pwa.installHint')}</p>
      </div>
      <button
        type="button"
        onClick={() => void install()}
        className="shrink-0 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
      >
        {t('pwa.install')}
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-lg p-1.5 text-muted transition hover:text-ink"
        aria-label={t('common.close')}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
