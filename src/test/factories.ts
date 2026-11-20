import type { CalendarEvent, Deadline, Task } from '@/types/models';
import type { AiContext } from '@/types/api';

/** 测试工厂：生成带完整 BaseEntity 字段的实体，避免测试里手写冗余字段 */

const base = {
  user_id: 'u-test',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
  deleted_at: null,
  timezone: 'Asia/Singapore',
};

export function makeTask(patch: Partial<Task> = {}): Task {
  return {
    ...base,
    id: 't-1',
    title: '任务',
    notes: null,
    category_id: null,
    priority: 'medium',
    estimated_minutes: 30,
    due_at: null,
    remind_at: null,
    is_completed: false,
    completed_at: null,
    parent_task_id: null,
    event_id: null,
    ...patch,
  };
}

export function makeDeadline(patch: Partial<Deadline> = {}): Deadline {
  return {
    ...base,
    id: 'd-1',
    title: '截止',
    description: null,
    due_at: '2026-11-20T16:00:00.000Z',
    status: 'not_started',
    custom_reminder_at: null,
    category_id: null,
    related_task_id: null,
    related_event_id: null,
    ...patch,
  };
}

export function makeEvent(patch: Partial<CalendarEvent> = {}): CalendarEvent {
  const startAt = patch.start_at ?? '2026-11-19T01:00:00.000Z';
  return {
    ...base,
    id: 'e-1',
    title: '日程',
    description: null,
    location: null,
    start_at: startAt,
    end_at: '2026-11-19T02:00:00.000Z',
    all_day: false,
    category_id: null,
    calendar_key: 'default',
    recurrence_rule_id: null,
    original_event_id: null,
    is_exception: false,
    is_cancelled: false,
    // occurrence_date 须与 start_at 的日历日一致，否则 findFreeSlots 按日期过滤会错判
    occurrence_date: startAt.slice(0, 10),
    ...patch,
  };
}

export function makeContext(patch: Partial<AiContext> = {}): AiContext {
  return {
    timezone: 'Asia/Singapore',
    date: '2026-11-18', // 周三
    events: [],
    tasks: [],
    deadlines: [],
    ...patch,
  };
}
