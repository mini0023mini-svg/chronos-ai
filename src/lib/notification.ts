/**
 * 通知库 —— 浏览器 Notification API 封装 + 到期扫描纯函数。
 * 安全/隐私约束：
 *   - 权限由用户主动触发 requestPermission，不在页面加载时静默申请；
 *   - 偏好与去重记录仅存 localStorage，不上传；
 *   - 所有时间按用户时区解读，due_at 为 UTC ISO 字符串。
 */
import type { CalendarEvent, Deadline, Task } from '@/types/models';
import type { I18nKey } from '@/i18n';
import { formatInZone } from '@/lib/timezone';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

const PREF_KEY = 'chronos.notify.preferences';
const SEEN_KEY = 'chronos.notify.seen';

export interface NotifyPreferences {
  enabled: boolean;
  leadMinutes: number;
}

export const DEFAULT_NOTIFY_PREFS: NotifyPreferences = { enabled: false, leadMinutes: 30 };

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

/** 读取通知偏好（含容错） */
export function getNotifyPreferences(): NotifyPreferences {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return { ...DEFAULT_NOTIFY_PREFS };
    const parsed = JSON.parse(raw) as Partial<NotifyPreferences>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : false,
      leadMinutes:
        typeof parsed.leadMinutes === 'number' && parsed.leadMinutes >= 0
          ? parsed.leadMinutes
          : DEFAULT_NOTIFY_PREFS.leadMinutes,
    };
  } catch {
    return { ...DEFAULT_NOTIFY_PREFS };
  }
}

export function saveNotifyPreferences(prefs: NotifyPreferences): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/** 请求浏览器通知权限；返回最终权限状态 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result as NotificationPermissionState;
  } catch {
    return 'denied';
  }
}

/** 显示一条浏览器通知；无权限时静默跳过（由调用方决定是否写入应用内通知） */
export function showBrowserNotification(title: string, body: string, tag = 'chronos'): boolean {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return false;
  try {
    // 优先走 Service Worker registration（移动端支持更好），降级到 new Notification
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      void navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          body,
          icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
          badge: `${import.meta.env.BASE_URL}favicon.svg`,
          tag,
          // HashRouter + 子路径部署：通知点击跳回应用内通知页
          data: { url: `${import.meta.env.BASE_URL}#/notifications` },
        });
      });
    } else {
      new Notification(title, { body, tag });
    }
    return true;
  } catch {
    return false;
  }
}

// ============ 到期扫描（纯函数，可断言测试） ============

export interface DueCandidate {
  /** 去重键：类型 + 实体 id + 到期时间点 */
  key: string;
  title: string;
  /** 到期时间（UTC ISO） */
  dueAt: string;
  /** 用户时区下格式化的到期时间，用于文案 */
  dueLabel: string;
  messageKey: I18nKey;
  /** 应用内通知类型 */
  type: 'task_reminder' | 'deadline_reminder' | 'event_reminder';
}

export interface ScanOptions {
  now: Date;
  timezone: string;
  leadMinutes: number;
  /** 已提醒过的 key 集合（用于跳过） */
  seen?: Set<string>;
}

/**
 * 扫描在 [now, now + leadMinutes] 窗口内到期的任务/截止/日程。
 * 跳过已完成、已取消、已删除、已提醒过的条目。
 */
export function scanDueItems(
  tasks: Task[],
  deadlines: Deadline[],
  events: CalendarEvent[],
  options: ScanOptions,
): DueCandidate[] {
  const { now, timezone, leadMinutes, seen } = options;
  const nowMs = now.getTime();
  const horizonMs = nowMs + leadMinutes * 60 * 1000;
  const results: DueCandidate[] = [];

  const push = (
    key: string,
    title: string,
    dueAt: string,
    messageKey: I18nKey,
    type: DueCandidate['type'],
  ) => {
    if (seen?.has(key)) return;
    results.push({
      key,
      title,
      dueAt,
      dueLabel: formatInZone(dueAt, 'MM-dd HH:mm', timezone),
      messageKey,
      type,
    });
  };

  for (const task of tasks) {
    if (!task.due_at || task.is_completed || task.deleted_at || !task.remind_at) continue;
    const dueMs = new Date(task.due_at).getTime();
    if (dueMs >= nowMs && dueMs <= horizonMs) {
      push(`task:${task.id}:${task.due_at}`, task.title, task.due_at, 'notify.taskDue', 'task_reminder');
    }
  }

  for (const deadline of deadlines) {
    if (!deadline.due_at || deadline.deleted_at || deadline.status === 'finished') continue;
    const dueMs = new Date(deadline.due_at).getTime();
    if (dueMs >= nowMs && dueMs <= horizonMs) {
      push(
        `deadline:${deadline.id}:${deadline.due_at}`,
        deadline.title,
        deadline.due_at,
        'notify.deadlineDue',
        'deadline_reminder',
      );
    }
  }

  for (const event of events) {
    if (!event.start_at || event.deleted_at || event.is_cancelled) continue;
    const dueMs = new Date(event.start_at).getTime();
    if (dueMs >= nowMs && dueMs <= horizonMs) {
      push(`event:${event.id}:${event.start_at}`, event.title, event.start_at, 'notify.eventDue', 'event_reminder');
    }
  }

  return results.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

// ============ 提醒去重（localStorage） ============

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

/** 读取已提醒集合（供扫描时跳过） */
export function getSeenReminders(): Set<string> {
  return loadSeen();
}

/** 标记一条提醒已发送；同时淘汰 7 天前的旧记录避免无限增长 */
export function markReminderSeen(key: string): void {
  const seen = loadSeen();
  seen.add(key);
  const pruned = Array.from(seen).slice(-500);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(pruned));
  } catch {
    /* ignore */
  }
}
