import { useMemo, useState } from 'react';
import { Flag, Bell, Plus, Pencil, Trash2, Check, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { AsyncView } from '@/components/AsyncView';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DeadlineForm, type DeadlineDraft } from '@/components/deadlines/DeadlineForm';
import { useI18n } from '@/hooks/useI18n';
import { useErrorText } from '@/hooks/useErrorText';
import { useAsync } from '@/hooks/useAsync';
import { useDataSync } from '@/hooks/useDataSync';
import { usePreferences } from '@/hooks/usePreferences';
import { dataService } from '@/services';
import type { Deadline } from '@/types/models';
import type { DeadlineStatus } from '@/types/enums';
import type { I18nKey } from '@/i18n';
import { formatInZone } from '@/lib/timezone';
import { resolveDeadlineStatus, deadlineColor } from '@/lib/deadline';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<DeadlineStatus, BadgeTone> = {
  not_started: 'primary',
  normal: 'success',
  soon: 'warning',
  overdue: 'danger',
  finished: 'neutral',
};

const STATUS_LABEL_KEY: Record<DeadlineStatus, I18nKey> = {
  not_started: 'deadline.status.not_started',
  normal: 'deadline.status.normal',
  soon: 'deadline.status.soon',
  overdue: 'deadline.status.overdue',
  finished: 'deadline.status.finished',
};

export default function DeadlinesPage() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const { timezone } = usePreferences();
  const deadlinesState = useAsync(() => dataService.deadlines.list(), []);
  useDataSync('all', deadlinesState.refresh);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Deadline | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const sorted = useMemo(
    () => [...(deadlinesState.data ?? [])].sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()),
    [deadlinesState.data],
  );

  const openCreate = () => {
    setEditing(null);
    setError('');
    setFormOpen(true);
  };

  const openEdit = (d: Deadline) => {
    setEditing(d);
    setError('');
    setFormOpen(true);
  };

  const handleSubmit = async (draft: DeadlineDraft) => {
    setSubmitting(true);
    setError('');
    try {
      const result = editing
        ? await dataService.deadlines.update(editing.id, draft)
        : await dataService.deadlines.create(draft);
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      setFormOpen(false);
      setEditing(null);
      deadlinesState.reload();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFinished = async (d: Deadline) => {
    const next: DeadlineStatus = d.status === 'finished' ? 'normal' : 'finished';
    const result = await dataService.deadlines.update(d.id, { status: next });
    if (result.ok) deadlinesState.reload();
  };

  const remove = async (d: Deadline) => {
    if (!window.confirm(t('deadlines.deleteConfirm'))) return;
    const result = await dataService.deadlines.remove(d.id);
    if (result.ok) deadlinesState.reload();
  };

  const currentDraft: DeadlineDraft | null = editing
    ? {
        title: editing.title,
        description: editing.description,
        due_at: editing.due_at,
        status: editing.status,
        custom_reminder_at: editing.custom_reminder_at,
        category_id: editing.category_id,
      }
    : null;

  return (
    <>
      <PageHeader
        title={t('deadlines.title')}
        subtitle={t('deadlines.subtitle')}
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('deadlines.newDeadline')}
          </Button>
        }
      />

      <p className="mb-4 text-xs text-muted">{t('deadlines.autoStatusHint')}</p>
      {error && <p className="mb-3 rounded-xl bg-danger/10 px-4 py-2 text-xs text-danger">{error}</p>}

      <AsyncView state={deadlinesState} isEmpty={() => true} empty={<EmptyState description={t('deadlines.none')} />}>
        {() => {
          if (sorted.length === 0) return <EmptyState description={t('deadlines.none')} />;
          return (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {sorted.map((d) => {
                const status = resolveDeadlineStatus(d);
                return (
                  <Card key={d.id} className={cn('flex items-start gap-3', status === 'finished' && 'opacity-60')}>
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: deadlineColor(status) }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={cn('truncate text-sm font-medium text-ink', status === 'finished' && 'line-through')}>{d.title}</p>
                        <Badge tone={STATUS_TONE[status]}>{t(STATUS_LABEL_KEY[status])}</Badge>
                      </div>
                      {d.description && <p className="mt-1 text-xs text-muted">{d.description}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Flag className="h-3 w-3" aria-hidden />
                          {formatInZone(d.due_at, 'yyyy-MM-dd HH:mm', timezone)}
                        </span>
                        {d.custom_reminder_at && (
                          <span className="inline-flex items-center gap-1">
                            <Bell className="h-3 w-3" aria-hidden />
                            {t('deadlines.customReminder')}: {formatInZone(d.custom_reminder_at, 'MM-dd HH:mm', timezone)}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" onClick={() => void toggleFinished(d)}>
                          {d.status === 'finished'
                            ? <><RotateCcw className="h-3.5 w-3.5" aria-hidden /> {t('deadlines.reopen')}</>
                            : <><Check className="h-3.5 w-3.5" aria-hidden /> {t('deadlines.markFinished')}</>}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(d)}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden /> {t('common.edit')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void remove(d)}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden /> {t('common.delete')}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          );
        }}
      </AsyncView>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? t('deadlines.editDeadline') : t('deadlines.newDeadline')}>
        <DeadlineForm
          initial={currentDraft}
          timezone={timezone}
          submitting={submitting}
          onSubmit={(draft) => void handleSubmit(draft)}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>
    </>
  );
}
