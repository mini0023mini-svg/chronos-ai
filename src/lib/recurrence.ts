import { addDays, addMonths, addYears } from 'date-fns';
import type { CalendarEvent, RecurringRule } from '@/types/models';
import type { RecurrenceFreq } from '@/types/enums';

/** 修改重复事件的影响范围 */
export type EventScope = 'this' | 'following' | 'all';

/** 物化重复系列时生成的周数跨度（可在 UI 中扩展） */
export const RECURRENCE_WEEKS = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

function stepDate(date: Date, freq: RecurrenceFreq, interval: number): Date {
  const step = Math.max(1, interval || 1);
  switch (freq) {
    case 'daily':
      return addDays(date, step);
    case 'weekly':
      return addDays(date, step * 7);
    case 'monthly':
      return addMonths(date, step);
    case 'yearly':
      return addYears(date, step);
  }
}

export interface OccurrenceRange {
  start_at: string;
  end_at: string;
  occurrence_date: string;
}

export interface RecurrenceSpec {
  freq: RecurrenceFreq;
  interval: number;
  end_date: string | null;
  count: number | null;
}

/**
 * 基于首个事件与规则生成后续 occurrence（不含首个）。
 * 返回值会作为独立事件行物化写入 events 表，使每一周都能单独编辑/删除。
 */
export function generateOccurrences(
  first: { start_at: string; end_at: string },
  rule: RecurrenceSpec,
  weeks = RECURRENCE_WEEKS,
): OccurrenceRange[] {
  const start = new Date(first.start_at);
  const end = new Date(first.end_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const duration = Math.max(0, end.getTime() - start.getTime());
  const horizon = start.getTime() + weeks * 7 * DAY_MS;
  const limit = rule.end_date ? new Date(`${rule.end_date}T23:59:59`).getTime() : Infinity;
  const maxCount = rule.count ?? Infinity;

  const out: OccurrenceRange[] = [];
  let cursor = start;
  let n = 1; // 首个事件已存在，不重复生成
  while (n < maxCount && out.length < 500) {
    cursor = stepDate(cursor, rule.freq, rule.interval);
    const t = cursor.getTime();
    if (t > horizon || t > limit) break;
    const startAt = cursor.toISOString();
    out.push({
      start_at: startAt,
      end_at: new Date(t + duration).toISOString(),
      occurrence_date: startAt.slice(0, 10),
    });
    n += 1;
  }
  return out;
}

/** 按影响范围算出需要修改/删除的事件 id 集合 */
export function scopeEventIds(target: CalendarEvent, all: CalendarEvent[], scope: EventScope): string[] {
  if (!target.recurrence_rule_id || scope === 'this') return [target.id];
  const sameSeries = all.filter((e) => e.recurrence_rule_id === target.recurrence_rule_id);
  if (scope === 'all') return sameSeries.map((e) => e.id);
  const anchor = target.occurrence_date ?? target.start_at.slice(0, 10);
  return sameSeries
    .filter((e) => (e.occurrence_date ?? e.start_at.slice(0, 10)) >= anchor)
    .map((e) => e.id);
}

/** 检测候选事件与现有事件的时间冲突（同系列可排除） */
export function detectConflicts(
  candidate: { id?: string; start_at: string; end_at: string; all_day: boolean },
  all: CalendarEvent[],
  excludeIds: string[] = [],
): CalendarEvent[] {
  const start = new Date(candidate.start_at).getTime();
  const end = new Date(candidate.end_at).getTime();
  const excluded = new Set(excludeIds);
  const candidateDay = candidate.start_at.slice(0, 10);

  return all.filter((event) => {
    if (event.is_cancelled || excluded.has(event.id) || event.id === candidate.id) return false;
    const evStart = new Date(event.start_at).getTime();
    const evEnd = new Date(event.end_at).getTime();
    if (candidate.all_day || event.all_day) {
      return event.start_at.slice(0, 10) === candidateDay;
    }
    return start < evEnd && end > evStart;
  });
}

/** 重复规则的短标签（用于事件卡片与提示） */
export function recurrenceLabel(rule: Pick<RecurrenceSpec, 'freq' | 'interval'>): string {
  const every = rule.interval > 1 ? `${rule.interval}` : '';
  switch (rule.freq) {
    case 'daily':
      return `Every ${every}day(s)`;
    case 'weekly':
      return `Every ${every}week(s)`;
    case 'monthly':
      return `Every ${every}month(s)`;
    case 'yearly':
      return `Every ${every}year(s)`;
  }
}

/** 从规则表行提取规格 */
export function specFromRule(rule: RecurringRule): RecurrenceSpec {
  return { freq: rule.freq, interval: rule.interval, end_date: rule.end_date, count: rule.count };
}
