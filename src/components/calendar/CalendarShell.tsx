import { useMemo, useState, type DragEvent } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import type { CalendarEvent } from '@/types/models';
import type { Locale } from '@/types/enums';
import type { EventInput } from '@fullcalendar/core';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import zhCnLocale from '@fullcalendar/core/locales/zh-cn';
import { useI18n } from '@/hooks/useI18n';
import { DEFAULT_TIMEZONE, formatInZone } from '@/lib/timezone';

export type CalendarView = 'month' | 'week' | 'day';

export interface CalendarShellProps {
  events: CalendarEvent[];
  view: CalendarView;
  timezone?: string;
  onEventClick?: (event: CalendarEvent) => void;
  onEventDrop?: (event: CalendarEvent, targetDate: string) => void;
  onDateClick?: (date: string) => void;
}

/** 取 Date 的本地日历日期（yyyy-MM-dd），与 timeZone="local" 的显示保持一致 */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 按分类 id 映射的柔和配色（与全局主色协调） */
const colorByCategory: Record<string, string> = {
  'cat-1': '#829CC4',
  'cat-2': '#A0BDA7',
  'cat-3': '#E8C77B',
  'cat-4': '#D98C8C',
  'cat-5': '#B4A7D9',
  'cat-6': '#8B9099',
};

/**
 * 把 UTC 时刻投影为「用户偏好时区的墙上时间」字符串（不带时区后缀）。
 * FullCalendar 对无时区后缀的字符串不做任何偏移，直接按该钟点显示，
 * 从而避免 timeZone 解析差异导致事件整体±N小时的问题。
 */
function wallTime(utcIso: string | null | undefined, timezone: string): string | undefined {
  if (!utcIso) return undefined;
  return formatInZone(utcIso, "yyyy-MM-dd'T'HH:mm:ss", timezone);
}

export function toEventInput(event: CalendarEvent, timezone: string): EventInput {
  if (event.is_cancelled) {
    return { id: event.id, title: event.title, start: event.occurrence_date ?? event.start_at, display: 'none' };
  }
  const color = event.category_id ? (colorByCategory[event.category_id] ?? '#829CC4') : '#829CC4';
  return {
    id: event.id,
    title: event.title,
    // 全天事件保留纯日期；定时事件投影为墙上时间，确保显示钟点 == 用户设置的上课钟点
    start: event.all_day ? event.start_at.slice(0, 10) : wallTime(event.start_at, timezone) ?? event.start_at,
    end: event.all_day ? undefined : wallTime(event.end_at, timezone) ?? undefined,
    allDay: event.all_day,
    backgroundColor: color,
    borderColor: 'transparent',
    textColor: '#ffffff',
    extendedProps: {
      location: event.location,
      notes: event.description,
      isRecurring: Boolean(event.recurrence_rule_id),
    },
  };
}

/** 24 小时制（中国习惯）：事件标签与周视图时间轴都用它，避免 12h AM/PM */
const timeFormat24 = { hour: '2-digit', minute: '2-digit', hour12: false } as const;

const WEEK_LABELS: Record<Locale, string[]> = {
  'zh-CN': ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  'en-US': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

/** 取某日期所在周的周一（周一为一周起点） */
function mondayOf(dateStr: string): string {
  const d = parseISO(dateStr);
  const dow = (d.getDay() + 6) % 7;
  return format(addDays(d, -dow), 'yyyy-MM-dd');
}

interface WeekBoardProps {
  events: CalendarEvent[];
  timezone: string;
  locale: Locale;
  onEventClick?: (event: CalendarEvent) => void;
  onEventDrop?: (event: CalendarEvent, targetDate: string) => void;
  onDateClick?: (date: string) => void;
}

/** 仅保留有日程的时间行：返回按 HH:mm 升序的时刻及其事件（纯函数，便于测试） */
export function buildWeekSlots(events: CalendarEvent[], days: string[], timezone: string) {
  const daySet = new Set(days);
  const buckets = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    if (e.is_cancelled) continue;
    const day = formatInZone(e.start_at, 'yyyy-MM-dd', timezone);
    if (!daySet.has(day)) continue;
    const time = formatInZone(e.start_at, 'HH:mm', timezone);
    const list = buckets.get(time) ?? [];
    list.push(e);
    buckets.set(time, list);
  }
  const slots = [...buckets.keys()].sort((a, b) => a.localeCompare(b));
  for (const list of buckets.values()) list.sort((a, b) => a.start_at.localeCompare(b.start_at));
  return { slots, slotEvents: buckets };
}

/**
 * 自定义周视图：保留周一→周日 7 列（周日在最右），但只渲染「有日程的时间行」。
 * 时间行来自当前周事件的墙上时间（用户时区），按开始时刻升序；空档（如午休、凌晨）不占位。
 * 支持点击日程 / 点击空格新建 / 拖动改期（拖到目标日期列）。
 */
function WeekBoard({ events, timezone, locale, onEventClick, onEventDrop, onDateClick }: WeekBoardProps) {
  const { t } = useI18n();
  const todayKey = formatInZone(new Date(), 'yyyy-MM-dd', timezone);
  const [anchor, setAnchor] = useState(() => mondayOf(todayKey));
  const weekDays = useMemo(() => {
    const monday = mondayOf(anchor);
    return Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(monday), i), 'yyyy-MM-dd'));
  }, [anchor]);

  // 当前周内非取消事件，按「墙上时间 HH:mm」分桶，只保留有事件的时间行
  const { slots, slotEvents } = useMemo(
    () => buildWeekSlots(events, weekDays, timezone),
    [events, weekDays, timezone],
  );

  const shiftWeek = (delta: number) => {
    const next = format(addDays(parseISO(anchor), delta * 7), 'yyyy-MM-dd');
    setAnchor(next);
  };

  const onCellDrop = (evt: DragEvent<HTMLDivElement>, targetDate: string) => {
    evt.preventDefault();
    const id = evt.dataTransfer.getData('text/plain');
    const found = events.find((e) => e.id === id);
    if (found) onEventDrop?.(found, targetDate);
  };

  const weekLabel = `${weekDays[0]} ~ ${weekDays[6]}`;

  return (
    <div className="surface-card overflow-hidden p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => shiftWeek(-1)} className="rounded-lg border px-2.5 py-1 text-xs text-muted hover:text-ink" style={{ borderColor: 'var(--border)' }} aria-label="previous week">‹</button>
          <button type="button" onClick={() => setAnchor(todayKey)} className="rounded-lg border px-2.5 py-1 text-xs text-ink" style={{ borderColor: 'var(--border)' }}>{t('common.today')}</button>
          <button type="button" onClick={() => shiftWeek(1)} className="rounded-lg border px-2.5 py-1 text-xs text-muted hover:text-ink" style={{ borderColor: 'var(--border)' }} aria-label="next week">›</button>
        </div>
        <span className="text-xs font-medium tabular-nums text-muted">{weekLabel}</span>
      </div>

      {slots.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{t('calendar.weekEmpty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="px-1 py-2 text-center text-[10px] text-muted">{t('calendar.weekTime')}</div>
              {weekDays.map((day, i) => (
                <div key={day} className={`px-1 py-2 text-center ${day === todayKey ? 'text-primary' : 'text-ink'}`}>
                  <p className="text-xs font-semibold">{WEEK_LABELS[locale][i]}</p>
                  <p className="text-[10px] tabular-nums text-muted">{day.slice(5)}</p>
                </div>
              ))}
            </div>
            {slots.map((time) => (
              <div key={time} className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                <div className="px-1 py-2 text-center text-[11px] font-medium tabular-nums text-muted">{time}</div>
                {weekDays.map((day) => {
                  const list = (slotEvents.get(time) ?? []).filter((e) => formatInZone(e.start_at, 'yyyy-MM-dd', timezone) === day);
                  return (
                    <div
                      key={day}
                      className="min-h-[52px] border-l px-1 py-1"
                      style={{ borderColor: 'var(--border)' }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => onCellDrop(e, day)}
                      onClick={() => onDateClick?.(day)}
                    >
                      {list.map((e) => {
                        const color = e.category_id ? (colorByCategory[e.category_id] ?? '#829CC4') : '#829CC4';
                        const end = formatInZone(e.end_at, 'HH:mm', timezone);
                        return (
                          <button
                            key={e.id}
                            type="button"
                            draggable={Boolean(onEventDrop)}
                            onDragStart={(ev) => ev.dataTransfer.setData('text/plain', e.id)}
                            onClick={(ev) => { ev.stopPropagation(); onEventClick?.(e); }}
                            className="mb-1 block w-full rounded-md px-1.5 py-1 text-left text-[11px] leading-tight text-white transition hover:brightness-105"
                            style={{ backgroundColor: color }}
                            title={`${e.title} ${time}-${end}${e.location ? ` @${e.location}` : ''}`}
                          >
                            <span className="block truncate font-medium">{e.title}</span>
                            <span className="block truncate text-[10px] opacity-90">{time}-{end}{e.location ? ` · ${e.location}` : ''}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** FullCalendar 包装器：接入点击 / 拖动 / 空白日期新建 */
export function CalendarShell({ events, view, timezone = DEFAULT_TIMEZONE, onEventClick, onEventDrop, onDateClick }: CalendarShellProps) {
  const { locale } = useI18n();

  // 周视图改用自定义紧凑看板：只留有课的时间行，跳过空档；其余视图仍用 FullCalendar
  if (view === 'week') {
    return <WeekBoard events={events} timezone={timezone} locale={locale} onEventClick={onEventClick} onEventDrop={onEventDrop} onDateClick={onDateClick} />;
  }

  const calendarView = view === 'month' ? 'dayGridMonth' : 'timeGridDay';

  return (
    <div className="surface-card overflow-hidden p-3 sm:p-4">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={calendarView}
        key={calendarView}
        themeSystem="standard"
        // 事件 start/end 已投影为用户时区的墙上时间，这里按本地显示即可，避免二次偏移
        timeZone="local"
        events={events.map((e) => toEventInput(e, timezone))}
        headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
        height="auto"
        contentHeight={620}
        editable={Boolean(onEventDrop)}
        selectable={Boolean(onDateClick)}
        navLinks={false}
        dayMaxEvents={3}
        // 中文界面用 zh-cn（周一为一周起点、24 小时制），英文界面保留 en 但仍强制 24 小时制
        locale={locale === 'zh-CN' ? zhCnLocale : 'en'}
        firstDay={1}
        eventTimeFormat={timeFormat24}
        slotLabelFormat={timeFormat24}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          const found = events.find((e) => e.id === info.event.id);
          if (found) onEventClick?.(found);
        }}
        eventDrop={(info) => {
          const found = events.find((e) => e.id === info.event.id);
          if (!found) return;
          const targetDate = localDateStr(info.event.start ?? new Date());
          const sourceDate = localDateStr(info.oldEvent.start ?? new Date());
          if (targetDate === sourceDate) return;
          onEventDrop?.(found, targetDate);
        }}
        dateClick={(info) => {
          onDateClick?.(info.dateStr);
        }}
      />
    </div>
  );
}
