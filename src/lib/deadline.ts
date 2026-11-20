import type { Deadline } from '@/types/models';
import type { DeadlineStatus } from '@/types/enums';

/** 即将截止阈值：3 天 */
const SOON_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * 按 due_at 与用户标注状态统一计算显示状态：
 *   finished > overdue > soon > normal / not_started
 * 用户手动标记为 finished 时始终优先。
 */
export function resolveDeadlineStatus(deadline: Deadline, now = Date.now()): DeadlineStatus {
  if (deadline.status === 'finished') return 'finished';
  const due = new Date(deadline.due_at).getTime();
  if (Number.isNaN(due)) return deadline.status;
  if (due < now) return 'overdue';
  if (due - now <= SOON_THRESHOLD_MS) return 'soon';
  return deadline.status === 'not_started' ? 'not_started' : 'normal';
}

const COLOR: Record<DeadlineStatus, string> = {
  not_started: '#829CC4', // 蓝
  normal: '#A0BDA7',      // 绿
  soon: '#E8C77B',        // 黄
  overdue: '#D98C8C',     // 红
  finished: '#8B9099',    // 灰
};

export function deadlineColor(status: DeadlineStatus): string {
  return COLOR[status] ?? COLOR.finished;
}
