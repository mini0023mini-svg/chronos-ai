import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/hooks/useI18n';
import type { Category } from '@/types/models';
import type { RecurrenceFreq } from '@/types/enums';
import type { EventDraft, RecurrenceSpec } from '@/services/calendarService';
import { DEFAULT_TIMEZONE, formatInZone, fromZoneTime } from '@/lib/timezone';

const FREQS: RecurrenceFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];

/** datetime-local 需要的本地时间字符串（yyyy-MM-dd'T'HH:mm） */
function toLocalInput(iso: string, zone: string): string {
  return formatInZone(iso, "yyyy-MM-dd'T'HH:mm", zone);
}

/** 把 datetime-local 字符串按指定时区解析为 UTC ISO */
function fromLocalInput(value: string, zone: string): string {
  return fromZoneTime(value, zone).toISOString();
}

export interface EventFormProps {
  initial: EventDraft | null;
  categories: Category[];
  timezone?: string;
  conflictTitles?: string[];
  submitting?: boolean;
  onSubmit: (draft: EventDraft) => void;
  onCancel: () => void;
  onSaveAnyway?: () => void;
}

/** 日程表单：基础字段 + 重复规则 + 冲突预览 */
export function EventForm({
  initial,
  categories,
  timezone = DEFAULT_TIMEZONE,
  conflictTitles = [],
  submitting = false,
  onSubmit,
  onCancel,
  onSaveAnyway,
}: EventFormProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [allDay, setAllDay] = useState(initial?.all_day ?? false);
  const [startLocal, setStartLocal] = useState(
    initial ? toLocalInput(initial.start_at, timezone) : toLocalInput(new Date().toISOString(), timezone).slice(0, 11) + '09:00',
  );
  const [endLocal, setEndLocal] = useState(
    initial ? toLocalInput(initial.end_at, timezone) : toLocalInput(new Date().toISOString(), timezone).slice(0, 11) + '10:00',
  );
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? categories[0]?.id ?? '');
  const [repeat, setRepeat] = useState(initial?.recurrence?.freq !== undefined);
  const [freq, setFreq] = useState<RecurrenceFreq>(initial?.recurrence?.freq ?? 'weekly');
  const [interval, setInterval] = useState(initial?.recurrence?.interval ?? 1);
  const [until, setUntil] = useState(initial?.recurrence?.end_date ?? '');
  const [count, setCount] = useState(initial?.recurrence?.count?.toString() ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initial) return;
    setTitle(initial.title);
    setDescription(initial.description ?? '');
    setLocation(initial.location ?? '');
    setAllDay(initial.all_day);
    setStartLocal(toLocalInput(initial.start_at, timezone));
    setEndLocal(toLocalInput(initial.end_at, timezone));
    setCategoryId(initial.category_id ?? categories[0]?.id ?? '');
    setRepeat(initial.recurrence?.freq !== undefined);
    if (initial.recurrence) {
      setFreq(initial.recurrence.freq);
      setInterval(initial.recurrence.interval);
      setUntil(initial.recurrence.end_date ?? '');
      setCount(initial.recurrence.count?.toString() ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const buildDraft = (): EventDraft => {
    const start = fromLocalInput(startLocal, timezone);
    const end = fromLocalInput(endLocal, timezone);
    const recurrence: RecurrenceSpec | null = repeat
      ? {
          freq,
          interval: Math.max(1, interval || 1),
          end_date: until || null,
          count: count ? Math.max(1, Number(count)) : null,
        }
      : null;
    return {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      start_at: start,
      end_at: end,
      all_day: allDay,
      category_id: categoryId || null,
      timezone,
      recurrence,
    };
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(t('calendar.eventTitle') + ' *');
      return;
    }
    const draft = buildDraft();
    if (new Date(draft.end_at).getTime() <= new Date(draft.start_at).getTime()) {
      setError(t('calendar.eventEnd'));
      return;
    }
    setError('');
    onSubmit(draft);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label={t('calendar.eventTitle')} value={title} onChange={(e) => setTitle(e.target.value)} error={error === t('calendar.eventTitle') + ' *' ? error : undefined} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label={t('calendar.eventStart')} type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} required />
        <Input label={t('calendar.eventEnd')} type="datetime-local" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} required />
      </div>
      {error && error !== t('calendar.eventTitle') + ' *' && <p className="text-xs text-danger">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-primary" />
          {t('calendar.eventAllDay')}
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select label={t('calendar.eventCategory')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Input label={t('calendar.eventLocation')} value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>

      <Input label={t('calendar.eventNotes')} value={description} onChange={(e) => setDescription(e.target.value)} />

      <Card className="space-y-3 p-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="accent-primary" />
          {t('calendar.eventRecurrence')}
        </label>
        {repeat && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select label={t('calendar.eventRecurrence')} value={freq} onChange={(e) => setFreq(e.target.value as RecurrenceFreq)}>
                {FREQS.map((f) => <option key={f} value={f}>{t(`calendar.recurrence.${f}` as const)}</option>)}
              </Select>
              <Input label={t('calendar.recurrence.every')} type="number" min={1} value={interval} onChange={(e) => setInterval(Number(e.target.value))} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label={t('calendar.recurrence.until')} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
              <Input label={t('calendar.recurrence.count')} type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} placeholder={t('common.optional')} />
            </div>
          </>
        )}
      </Card>

      {conflictTitles.length > 0 && (
        <Card className="border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-medium text-ink">{t('calendar.conflictDetected')}</p>
          <p className="mt-1 text-xs text-muted">{t('calendar.conflictHint')}</p>
          <ul className="mt-2 list-inside list-disc text-xs text-muted">
            {conflictTitles.map((name, i) => <li key={i}>{name}</li>)}
          </ul>
          {onSaveAnyway && (
            <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onSaveAnyway}>
              {t('calendar.saveAnyway')}
            </Button>
          )}
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button type="button" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={submitting}>{t('common.save')}</Button>
      </div>
    </form>
  );
}
