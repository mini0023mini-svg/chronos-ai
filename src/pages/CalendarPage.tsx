import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { CalendarShell, type CalendarView } from '@/components/calendar/CalendarShell';
import { EventForm } from '@/components/calendar/EventForm';
import { ScopeDialog } from '@/components/calendar/ScopeDialog';
import { AsyncView } from '@/components/AsyncView';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useI18n } from '@/hooks/useI18n';
import { useErrorText } from '@/hooks/useErrorText';
import { useAsync } from '@/hooks/useAsync';
import { useDataSync } from '@/hooks/useDataSync';
import { usePreferences } from '@/hooks/usePreferences';
import { dataService } from '@/services';
import {
  calendarService,
  type EventDraft,
} from '@/services/calendarService';
import type { EventScope } from '@/lib/recurrence';
import { detectConflicts } from '@/lib/recurrence';
import type { CalendarEvent } from '@/types/models';
import { cn } from '@/lib/utils';
import { formatInZone, fromZoneTime } from '@/lib/timezone';
import { eachDayOfInterval, endOfYear, format, startOfYear } from 'date-fns';

type View = CalendarView | 'year';

type PendingOp =
  | { kind: 'create'; draft: EventDraft; scope: EventScope }
  | { kind: 'update'; event: CalendarEvent; draft: EventDraft; scope: EventScope }
  | { kind: 'move'; event: CalendarEvent; date: string; scope: EventScope }
  | { kind: 'delete'; event: CalendarEvent; scope: EventScope };

export default function CalendarPage() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const { timezone } = usePreferences();
  const [view, setView] = useState<View>('week');
  const eventsState = useAsync(() => dataService.events.list(), []);
  const categoriesState = useAsync(() => dataService.categories.list(), []);
  useDataSync('all', eventsState.refresh);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [formSeed, setFormSeed] = useState<EventDraft | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [pending, setPending] = useState<PendingOp | null>(null);
  const [conflictTitles, setConflictTitles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const events = useMemo(() => eventsState.data ?? [], [eventsState.data]);
  const activeEvents = useMemo(() => events.filter((e) => !e.is_cancelled), [events]);
  const categories = categoriesState.data ?? [];

  const viewTabs: { key: View; label: string }[] = [
    { key: 'year', label: t('calendar.year') },
    { key: 'month', label: t('calendar.month') },
    { key: 'week', label: t('calendar.week') },
    { key: 'day', label: t('calendar.day') },
  ];

  const draftFromEvent = (event: CalendarEvent): EventDraft => ({
    title: event.title,
    description: event.description,
    location: event.location,
    start_at: event.start_at,
    end_at: event.end_at,
    all_day: event.all_day,
    category_id: event.category_id,
    timezone,
    recurrence: event.recurrence_rule_id
      ? { freq: 'weekly', interval: 1, end_date: null, count: null }
      : null,
  });

  const openCreate = (date?: string) => {
    setEditing(null);
    setConflictTitles([]);
    setError('');
    const start = date ? fromZoneTime(`${date}T09:00`, timezone).toISOString() : new Date().toISOString();
    const startDate = new Date(start);
    setFormSeed({
      title: '',
      description: null,
      location: null,
      start_at: start,
      end_at: new Date(startDate.getTime() + 60 * 60 * 1000).toISOString(),
      all_day: false,
      category_id: categories[0]?.id ?? null,
      timezone,
      recurrence: null,
    });
    setFormOpen(true);
  };

  const openEdit = (event: CalendarEvent) => {
    setEditing(event);
    setConflictTitles([]);
    setError('');
    setFormSeed(draftFromEvent(event));
    setFormOpen(true);
  };

  const findConflicts = (draft: EventDraft, excludeId?: string) =>
    detectConflicts(
      { id: excludeId, start_at: draft.start_at, end_at: draft.end_at, all_day: draft.all_day },
      activeEvents,
      excludeId ? [excludeId] : [],
    ).map((e) => e.title);

  /** 表单提交：重复日程先选范围；否则直接检测冲突后执行 */
  const handleFormSubmit = (draft: EventDraft) => {
    if (editing?.recurrence_rule_id) {
      // 编辑重复日程：暂存草稿，先询问影响范围
      setPending({ kind: 'update', event: editing, draft, scope: 'this' });
      setScopeOpen(true);
      return;
    }
    const conflicts = findConflicts(draft, editing?.id);
    if (conflicts.length > 0) {
      setConflictTitles(conflicts);
      setPending({ kind: editing ? 'update' : 'create', event: editing ?? undefined, draft, scope: 'this' } as PendingOp);
      return;
    }
    void execute({ kind: editing ? 'update' : 'create', event: editing ?? undefined, draft, scope: 'this' } as PendingOp);
  };

  const handleSaveAnyway = () => {
    setConflictTitles([]);
    if (pending) void execute(pending);
  };

  /** 执行操作：重复事件编辑/删除/拖动需先选择影响范围 */
  const requestOperation = (op: PendingOp) => {
    setConflictTitles([]);
    setError('');
    const event = 'event' in op ? op.event : undefined;
    if (event?.recurrence_rule_id) {
      setPending(op);
      setScopeOpen(true);
    } else {
      void execute({ ...op, scope: 'this' });
    }
  };

  const execute = async (op: PendingOp) => {
    setSubmitting(true);
    setError('');
    try {
      let result;
      switch (op.kind) {
        case 'create':
          result = await calendarService.createEvent(op.draft);
          break;
        case 'update':
          result = await calendarService.updateEvent(op.event, activeEvents, op.draft, op.scope);
          break;
        case 'move':
          result = await calendarService.moveEvent(op.event, activeEvents, op.date, op.scope);
          break;
        case 'delete':
          result = await calendarService.deleteEvent(op.event, activeEvents, op.scope);
          break;
      }
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      setFormOpen(false);
      setScopeOpen(false);
      setEditing(null);
      setPending(null);
      eventsState.reload();
    } finally {
      setSubmitting(false);
    }
  };

  const handleScopeConfirm = (scope: EventScope) => {
    if (!pending) return;
    setScopeOpen(false);
    const resolved = { ...pending, scope };
    // 编辑操作：选定范围后再检测冲突（不同范围涉及的实例不同）
    if (resolved.kind === 'update' && resolved.draft) {
      const conflicts = findConflicts(resolved.draft, resolved.event?.id);
      if (conflicts.length > 0) {
        setConflictTitles(conflicts);
        setPending(resolved);
        return;
      }
    }
    void execute(resolved);
  };

  const handleDuplicate = async (event: CalendarEvent) => {
    const result = await calendarService.duplicateEvent(event);
    if (result.ok) eventsState.reload();
    else setError(errorText(result.error));
  };

  const handleDelete = (event: CalendarEvent) => {
    if (!window.confirm(t('calendar.deleteConfirm'))) return;
    requestOperation({ kind: 'delete', event, scope: 'this' });
  };

  return (
    <>
      <PageHeader
        title={t('calendar.title')}
        subtitle={t('calendar.subtitle')}
        actions={
          <Button variant="primary" onClick={() => openCreate()}>
            {t('calendar.newEvent')}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label={t('calendar.title')}>
        {viewTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={view === tab.key}
            onClick={() => setView(tab.key)}
            className={cn(
              'rounded-xl px-4 py-2 text-sm transition',
              view === tab.key ? 'bg-primary font-medium text-white' : 'bg-card text-muted hover:text-ink',
            )}
            style={view === tab.key ? undefined : { borderColor: 'var(--border)', borderWidth: 1 }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="mb-3 text-xs text-muted">{t('calendar.dragHint')}</p>
      {error && <p className="mb-3 rounded-xl bg-danger/10 px-4 py-2 text-xs text-danger">{error}</p>}

      <AsyncView state={eventsState}>
        {(rawEvents) =>
          view === 'year' ? (
            <YearOverview events={activeEvents} hint={t('calendar.yearViewHint')} timezone={timezone} onDayClick={(day) => openCreate(day)} />
          ) : (
            <CalendarShell
              events={rawEvents}
              view={view}
              timezone={timezone}
              onEventClick={openEdit}
              onEventDrop={(event, date) => requestOperation({ kind: 'move', event, date, scope: 'this' })}
              onDateClick={(date) => openCreate(date)}
            />
          )
        }
      </AsyncView>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? t('common.edit') : t('calendar.newEvent')}>
        {editing && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void handleDuplicate(editing)}>{t('calendar.copy')}</Button>
            <Button size="sm" variant="danger" onClick={() => handleDelete(editing)}>{t('common.delete')}</Button>
            {editing.recurrence_rule_id && (
              <span className="text-[11px] text-muted">{t('calendar.recurringHint', { n: activeEvents.filter((e) => e.recurrence_rule_id === editing.recurrence_rule_id).length })}</span>
            )}
          </div>
        )}
        {formSeed && (
          <EventForm
            initial={formSeed}
            categories={categories}
            timezone={timezone}
            conflictTitles={conflictTitles}
            submitting={submitting}
            onSubmit={handleFormSubmit}
            onCancel={() => setFormOpen(false)}
            onSaveAnyway={conflictTitles.length > 0 ? handleSaveAnyway : undefined}
          />
        )}
      </Modal>

      <ScopeDialog
        open={scopeOpen}
        onClose={() => setScopeOpen(false)}
        onConfirm={handleScopeConfirm}
      />
    </>
  );
}

/** 年度总览：12 个月缩略网格（FullCalendar 免费版无原生年视图） */
function YearOverview({
  events,
  hint,
  timezone,
  onDayClick,
}: {
  events: CalendarEvent[];
  hint: string;
  timezone: string;
  onDayClick: (day: string) => void;
}) {
  const year = Number(formatInZone(new Date(), 'yyyy', timezone));
  const start = startOfYear(new Date(year, 0, 1));
  const end = endOfYear(new Date(year, 0, 1));
  const allDays = eachDayOfInterval({ start, end });
  const eventsByDay = new Map<string, CalendarEvent[]>();
  events.forEach((e) => {
    const key = (e.occurrence_date ?? e.start_at).slice(0, 10);
    const list = eventsByDay.get(key) ?? [];
    list.push(e);
    eventsByDay.set(key, list);
  });

  const months = Array.from({ length: 12 }, (_, m) => {
    const days = allDays.filter((d) => d.getMonth() === m);
    const firstWeekday = days.length ? (days[0].getDay() + 6) % 7 : 0;
    return { m, days, firstWeekday };
  });

  return (
    <Card>
      <p className="mb-4 text-xs text-muted">{hint} · {year}</p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map(({ m, days, firstWeekday }) => (
          <div key={m}>
            <p className="mb-2 text-center text-xs font-semibold text-ink">{format(new Date(year, m, 1), 'MMMM')}</p>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
                <span key={w} className="text-[9px] text-muted">{w}</span>
              ))}
              {Array.from({ length: firstWeekday }).map((_, i) => <span key={`b-${i}`} />)}
              {days.map((d) => {
                const key = format(d, 'yyyy-MM-dd');
                const dayEvents = eventsByDay.get(key) ?? [];
                return (
                  <button
                    type="button"
                    key={key}
                    title={dayEvents.length ? `${key} · ${dayEvents.map((e) => e.title).join(' / ')}` : key}
                    onClick={() => onDayClick(key)}
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded text-[10px] transition',
                      dayEvents.length > 0 ? 'bg-primary font-semibold text-white' : 'text-muted hover:bg-black/5 dark:hover:bg-white/5',
                    )}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
