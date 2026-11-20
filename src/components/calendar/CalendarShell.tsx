import type { CalendarEvent } from '@/types/models';
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

/** FullCalendar 包装器：接入点击 / 拖动 / 空白日期新建 */
export function CalendarShell({ events, view, timezone = DEFAULT_TIMEZONE, onEventClick, onEventDrop, onDateClick }: CalendarShellProps) {
  const { locale } = useI18n();
  const calendarView = view === 'month' ? 'dayGridMonth' : view === 'week' ? 'timeGridWeek' : 'timeGridDay';

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
