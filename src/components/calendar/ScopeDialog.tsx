import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useI18n } from '@/hooks/useI18n';
import type { EventScope } from '@/lib/recurrence';
import { cn } from '@/lib/utils';

export interface ScopeDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (scope: EventScope) => void;
  title?: string;
}

/** 重复事件修改范围选择：仅此次 / 此后全部 / 全部 */
export function ScopeDialog({ open, onClose, onConfirm, title }: ScopeDialogProps) {
  const { t } = useI18n();
  const [scope, setScope] = useState<EventScope>('this');
  const options: { key: EventScope; label: string }[] = [
    { key: 'this', label: t('calendar.scope.this') },
    { key: 'following', label: t('calendar.scope.following') },
    { key: 'all', label: t('calendar.scope.all') },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? t('calendar.editScope')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => onConfirm(scope)}>
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-xs text-muted">{t('calendar.scope.hint')}</p>
      <div className="space-y-2" role="radiogroup" aria-label={t('calendar.editScope')}>
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={scope === option.key}
            onClick={() => setScope(option.key)}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition',
              scope === option.key ? 'border-primary bg-primary/10 text-ink' : 'text-muted hover:text-ink',
            )}
            style={scope === option.key ? undefined : { borderColor: 'var(--border)' }}
          >
            <span
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                scope === option.key ? 'border-primary' : '',
              )}
              style={scope === option.key ? undefined : { borderColor: 'var(--border)' }}
            >
              {scope === option.key && <span className="h-2 w-2 rounded-full bg-primary" />}
            </span>
            {option.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
