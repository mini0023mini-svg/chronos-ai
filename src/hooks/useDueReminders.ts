import { useEffect, useRef } from 'react';
import { dataService } from '@/services';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { usePreferences } from '@/hooks/usePreferences';
import {
  scanDueItems,
  getNotifyPreferences,
  getSeenReminders,
  markReminderSeen,
  showBrowserNotification,
  getNotificationPermission,
} from '@/lib/notification';
import { translate } from '@/i18n';
import type { Locale } from '@/types/enums';

const SCAN_INTERVAL_MS = 60_000;

/**
 * 全局到期提醒调度：登录后每 60 秒扫描一次（首次延迟 3 秒避免与首屏加载竞争）。
 * - 尊重通知偏好：enabled=false 时完全不扫描；
 * - 浏览器通知仅在权限 granted 时触发；无权限也写入应用内通知；
 * - 去重键持久化到 localStorage，同一到期点只提醒一次。
 */
export function useDueReminders(): void {
  const { isAuthenticated } = useAuth();
  const { timezone } = usePreferences();
  const { locale } = useI18n();
  const localeRef = useRef<Locale>(locale);
  localeRef.current = locale;
  const tzRef = useRef(timezone);
  tzRef.current = timezone;

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    const scan = async () => {
      if (cancelled) return;
      const prefs = getNotifyPreferences();
      if (!prefs.enabled) return;

      try {
        const [tasksRes, deadlinesRes, eventsRes] = await Promise.all([
          dataService.tasks.list(),
          dataService.deadlines.list(),
          dataService.events.list(),
        ]);
        if (cancelled || !tasksRes.ok || !deadlinesRes.ok || !eventsRes.ok) return;

        const seen = getSeenReminders();
        const candidates = scanDueItems(tasksRes.data, deadlinesRes.data, eventsRes.data, {
          now: new Date(),
          timezone: tzRef.current,
          leadMinutes: prefs.leadMinutes,
          seen,
        });
        if (candidates.length === 0) return;

        const l = localeRef.current;
        for (const item of candidates) {
          const body = translate(l, item.messageKey, { title: item.title, time: item.dueLabel });
          const title = translate(l, 'notify.dueTitle');
          // 无论浏览器权限如何，都写入应用内通知（用户可在通知页回看）
          await dataService.notifications.create({
            type: item.type,
            title,
            body,
            payload: { key: item.key, due_at: item.dueAt },
            is_read: false,
            read_at: null,
            channel: getNotificationPermission() === 'granted' ? 'push' : 'in_app',
          });
          showBrowserNotification(title, body, item.key);
          markReminderSeen(item.key);
        }
      } catch {
        /* 扫描失败不影响应用使用，下一周期重试 */
      }
    };

    const firstTimer = setTimeout(() => void scan(), 3_000);
    const interval = setInterval(() => void scan(), SCAN_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(firstTimer);
      clearInterval(interval);
    };
  }, [isAuthenticated]);
}
