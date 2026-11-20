import type { Result } from '@/types/api';
import { ok, fail } from '@/types/api';
import type { CalendarEvent, RecurringRule } from '@/types/models';
import type { RecurrenceFreq } from '@/types/enums';
import type { EventScope, RecurrenceSpec } from '@/lib/recurrence';
import { generateOccurrences, scopeEventIds } from '@/lib/recurrence';
import { dataService } from './index';

/** 新建/编辑日程表单提交的业务载荷 */
export interface EventDraft {
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  category_id: string | null;
  timezone: string;
  recurrence: RecurrenceSpec | null;
}

/** 复用表单值类型（供页面使用） */
export type { RecurrenceSpec, EventScope, RecurrenceFreq };

/**
 * 创建日程。若带重复规则：先建规则，再把首个事件与后续 N 周实例一起物化落库，
 * 每个实例共享 recurrence_rule_id，从而支持「仅此次 / 此后全部 / 全部」独立操作。
 */
export async function createEvent(draft: EventDraft): Promise<Result<CalendarEvent>> {
  let ruleId: string | null = null;
  if (draft.recurrence) {
    const ruleResult = await dataService.recurringRules.create({
      title: draft.title,
      freq: draft.recurrence.freq,
      interval: draft.recurrence.interval,
      by_weekday: null,
      by_month_day: null,
      start_date: draft.start_at.slice(0, 10),
      end_date: draft.recurrence.end_date || null,
      count: draft.recurrence.count,
      superseded_by: null,
      timezone: draft.timezone,
    } as Partial<RecurringRule>);
    if (!ruleResult.ok) return fail(ruleResult.error);
    ruleId = ruleResult.data.id;
  }

  const firstResult = await dataService.events.create({
    title: draft.title,
    description: draft.description,
    location: draft.location,
    start_at: draft.start_at,
    end_at: draft.end_at,
    all_day: draft.all_day,
    category_id: draft.category_id,
    calendar_key: 'default',
    recurrence_rule_id: ruleId,
    original_event_id: null,
    is_exception: false,
    is_cancelled: false,
    occurrence_date: draft.start_at.slice(0, 10),
    timezone: draft.timezone,
  } as Partial<CalendarEvent>);
  if (!firstResult.ok) return fail(firstResult.error);

  if (draft.recurrence && ruleId) {
    const occurrences = generateOccurrences(firstResult.data, draft.recurrence);
    for (const occ of occurrences) {
      const result = await dataService.events.create({
        title: draft.title,
        description: draft.description,
        location: draft.location,
        start_at: occ.start_at,
        end_at: occ.end_at,
        all_day: draft.all_day,
        category_id: draft.category_id,
        calendar_key: 'default',
        recurrence_rule_id: ruleId,
        original_event_id: firstResult.data.id,
        is_exception: false,
        is_cancelled: false,
        occurrence_date: occ.occurrence_date,
        timezone: draft.timezone,
      } as Partial<CalendarEvent>);
      if (!result.ok) return fail(result.error);
    }
  }

  return ok(firstResult.data);
}

/** 按 UTC 日历日计算两个 yyyy-MM-dd 之间的天数差（目标 - 源） */
function dayDelta(fromDate: string, toDate: string): number {
  const parse = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(toDate) - parse(fromDate)) / 86_400_000);
}

/** 对单个实例施加天数偏移，保持时刻与时长不变 */
function shiftByDays(event: CalendarEvent, days: number): Partial<CalendarEvent> {
  const offset = days * 86_400_000;
  const nextStart = new Date(new Date(event.start_at).getTime() + offset).toISOString();
  const nextEnd = new Date(new Date(event.end_at).getTime() + offset).toISOString();
  return {
    start_at: nextStart,
    end_at: nextEnd,
    occurrence_date: nextStart.slice(0, 10),
  };
}

/**
 * 拖动改期。把「被拖动实例」从其原日期移动到 targetDate，
 * 其余受影响实例（following / all）施加相同的天数偏移，保持相对节奏。
 */
export async function moveEvent(
  event: CalendarEvent,
  allEvents: CalendarEvent[],
  targetDate: string,
  scope: EventScope,
): Promise<Result<number>> {
  const sourceDay = event.occurrence_date ?? event.start_at.slice(0, 10);
  const days = dayDelta(sourceDay, targetDate);
  const ids = scopeEventIds(event, allEvents, scope);
  let moved = 0;
  for (const id of ids) {
    const target = allEvents.find((e) => e.id === id);
    if (!target) continue;
    const patch: Partial<CalendarEvent> = {
      ...shiftByDays(target, days),
      // 「仅此次」脱离重复系列，避免影响其他周次
      ...(scope === 'this' && event.recurrence_rule_id ? { recurrence_rule_id: null, is_exception: true } : {}),
    };
    const result = await dataService.events.update(id, patch);
    if (!result.ok) return fail(result.error);
    moved += 1;
  }
  return ok(moved);
}

/** 按影响范围删除（软删除）日程 */
export async function deleteEvent(
  event: CalendarEvent,
  allEvents: CalendarEvent[],
  scope: EventScope,
): Promise<Result<number>> {
  const ids = scopeEventIds(event, allEvents, scope);
  let removed = 0;
  for (const id of ids) {
    const result = await dataService.events.remove(id);
    if (!result.ok) return fail(result.error);
    removed += 1;
  }
  return ok(removed);
}

/** 复制日程（新事件不继承重复规则，避免意外生成系列） */
export async function duplicateEvent(event: CalendarEvent): Promise<Result<CalendarEvent>> {
  return dataService.events.create({
    title: `${event.title} (copy)`,
    description: event.description,
    location: event.location,
    start_at: event.start_at,
    end_at: event.end_at,
    all_day: event.all_day,
    category_id: event.category_id,
    calendar_key: event.calendar_key,
    recurrence_rule_id: null,
    original_event_id: null,
    is_exception: false,
    is_cancelled: false,
    occurrence_date: event.occurrence_date,
    timezone: event.timezone,
  } as Partial<CalendarEvent>);
}

/**
 * 编辑已有日程。非重复事件或「仅此次」直接更新；
 * 重复事件的「此后全部 / 全部」对系列内每个实例字段级更新。
 */
export async function updateEvent(
  event: CalendarEvent,
  allEvents: CalendarEvent[],
  draft: EventDraft,
  scope: EventScope,
): Promise<Result<number>> {
  const ids = scopeEventIds(event, allEvents, scope);
  const sourceDay = event.occurrence_date ?? event.start_at.slice(0, 10);
  const days = dayDelta(sourceDay, draft.start_at);
  let updated = 0;
  for (const id of ids) {
    const target = allEvents.find((e) => e.id === id);
    if (!target) continue;
    const patch: Partial<CalendarEvent> = {
      title: draft.title,
      description: draft.description,
      location: draft.location,
      all_day: draft.all_day,
      category_id: draft.category_id,
      timezone: draft.timezone,
    };
    if (scope === 'this') {
      patch.start_at = draft.start_at;
      patch.end_at = draft.end_at;
      patch.occurrence_date = draft.start_at.slice(0, 10);
      if (event.recurrence_rule_id) {
        patch.recurrence_rule_id = null;
        patch.is_exception = true;
      }
    } else {
      // following / all：保持相对节奏，对每个实例施加相同天数偏移
      Object.assign(patch, shiftByDays(target, days));
    }
    const result = await dataService.events.update(id, patch);
    if (!result.ok) return fail(result.error);
    updated += 1;
  }
  return ok(updated);
}

export const calendarService = {
  createEvent,
  moveEvent,
  deleteEvent,
  duplicateEvent,
  updateEvent,
};
