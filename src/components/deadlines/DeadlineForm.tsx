import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useI18n } from '@/hooks/useI18n';
import type { DeadlineStatus, TaskCategory } from '@/types/enums';
import { DEFAULT_TIMEZONE, formatInZone, fromZoneTime } from '@/lib/timezone';

const CATEGORIES: TaskCategory[] = ['Study', 'Work', 'Personal', 'Exercise', 'Life', 'Other'];
const STATUSES: DeadlineStatus[] = ['not_started', 'normal', 'finished'];

function toLocalInput(iso: string, zone: string): string {
  return formatInZone(iso, "yyyy-MM-dd'T'HH:mm", zone);
}
function fromLocalInput(value: string, zone: string): string {
  return fromZoneTime(value, zone).toISOString();
}

export interface DeadlineDraft {
  title: string;
  description: string | null;
  due_at: string;
  status: DeadlineStatus;
  custom_reminder_at: string | null;
  category_id: string | null;
}

export interface DeadlineFormProps {
  initial: DeadlineDraft | null;
  timezone?: string;
  submitting?: boolean;
  onSubmit: (draft: DeadlineDraft) => void;
  onCancel: () => void;
}

/** 截止日期表单：标题/描述/截止/状态/自定义提醒/分类 */
export function DeadlineForm({
  initial,
  timezone = DEFAULT_TIMEZONE,
  submitting = false,
  onSubmit,
  onCancel,
}: DeadlineFormProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [due, setDue] = useState(initial ? toLocalInput(initial.due_at, timezone) : toLocalInput(new Date().toISOString(), timezone).slice(0, 11) + '23:59');
  const [status, setStatus] = useState<DeadlineStatus>(initial?.status ?? 'not_started');
  const [reminder, setReminder] = useState(initial?.custom_reminder_at ? toLocalInput(initial.custom_reminder_at, timezone) : '');
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? 'cat-1');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initial) return;
    setTitle(initial.title);
    setDescription(initial.description ?? '');
    setDue(toLocalInput(initial.due_at, timezone));
    setStatus(initial.status);
    setReminder(initial.custom_reminder_at ? toLocalInput(initial.custom_reminder_at, timezone) : '');
    setCategoryId(initial.category_id ?? 'cat-1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(t('deadlines.titleField') + ' *');
      return;
    }
    if (!due) {
      setError(t('deadlines.dueAt'));
      return;
    }
    setError('');
    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      due_at: fromLocalInput(due, timezone),
      status,
      custom_reminder_at: reminder ? fromLocalInput(reminder, timezone) : null,
      category_id: categoryId || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label={t('deadlines.titleField')} value={title} onChange={(e) => setTitle(e.target.value)} error={error ? error : undefined} />
      <Input label={t('deadlines.description')} value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label={t('deadlines.dueAt')} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        <Select label={t('common.status')} value={status} onChange={(e) => setStatus(e.target.value as DeadlineStatus)}>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`deadline.status.${s}` as const)}</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label={t('deadlines.customReminder')} type="datetime-local" value={reminder} onChange={(e) => setReminder(e.target.value)} />
        <Select label={t('tasks.category')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {CATEGORIES.map((c, i) => <option key={c} value={`cat-${i + 1}`}>{t(`category.${c}` as const)}</option>)}
        </Select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={submitting}>{t('common.save')}</Button>
      </div>
    </form>
  );
}
