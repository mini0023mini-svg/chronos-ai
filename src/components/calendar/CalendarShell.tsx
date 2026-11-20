import type { CalendarEvent } from '@/types/models';
import type { EventInput } from '@fullcalendar/core';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useTheme } from '@/hooks/useTheme';
import { DEFAULT_TIMEZONE } from '@/lib/timezone';

export type CalendarView = 'month' | 'week' | 'day';

export interface CalendarShellProps {
  events: CalendarEvent[];
  view: CalendarView;
  timezone?: string;
  onEventClick?: (event: CalendarEvent) => void;
  onEventDrop?: (event: CalendarEvent, targetDate: string) => void;
  onDateClick?: (date: string) => void;
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

function toEventInput(event: CalendarEvent): EventInput {
  if (event.is_cancelled) {
    return { id: event.id, title: event.title, start: event.occurrence_date ?? event.start_at, display: 'none' };
  }
  const color = event.category_id ? (colorByCategory[event.category_id] ?? '#829CC4') : '#829CC4';
  return {
    id: event.id,
    title: event.title,
    start: event.start_at,
    end: event.end_at,
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

/** FullCalendar 包装器：接入点击 / 拖动 / 空白日期新建 */
export function CalendarShell({ events, view, timezone = DEFAULT_TIMEZONE, onEventClick, onEventDrop, onDateClick }: CalendarShellProps) {
  const { resolvedTheme } = useTheme();
  const calendarView = view === 'month' ? 'dayGridMonth' : view === 'week' ? 'timeGridWeek' : 'timeGridDay';

  return (
    <div className="surface-card overflow-hidden p-3 sm:p-4">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={calendarView}
        key={calendarView}
        themeSystem="standard"
        timeZone={timezone}
        events={events.map(toEventInput)}
        headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
        height="auto"
        contentHeight={620}
        editable={Boolean(onEventDrop)}
        selectable={Boolean(onDateClick)}
        navLinks={false}
        dayMaxEvents={3}
        locale={resolvedTheme === 'dark' ? 'en' : undefined}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          const found = events.find((e) => e.id === info.event.id);
          if (found) onEventClick?.(found);
        }}
        eventDrop={(info) => {
          const found = events.find((e) => e.id === info.event.id);
          if (!found) return;
          const targetDate = (info.event.start ?? new Date()).toISOString().slice(0, 10);
          const sourceDate = (info.oldEvent.start ?? new Date()).toISOString().slice(0, 10);
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
