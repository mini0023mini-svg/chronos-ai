import { useEffect, useState } from 'react';
import { BellRing, Send } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { Button } from '@/components/ui/Button';
import {
  getNotifyPreferences,
  saveNotifyPreferences,
  getNotificationPermission,
  requestNotificationPermission,
  showBrowserNotification,
  type NotificationPermissionState,
  type NotifyPreferences,
} from '@/lib/notification';

/** 设置页的通知偏好面板：本地持久化，无需后端 */
export function NotificationSettings() {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<NotifyPreferences>(getNotifyPreferences);
  const [permission, setPermission] = useState<NotificationPermissionState>(getNotificationPermission);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  const update = (patch: Partial<NotifyPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveNotifyPreferences(next);
      return next;
    });
  };

  const enable = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted' || result === 'unsupported') update({ enabled: true });
  };

  const sendTest = () => {
    const ok = showBrowserNotification(
      t('notifications.testTitle'),
      t('notifications.testBody'),
      'chronos-test',
    );
    setTestSent(ok);
    setTimeout(() => setTestSent(false), 2500);
  };

  const permissionKey =
    permission === 'granted'
      ? 'settings.notify.permission.granted'
      : permission === 'denied'
        ? 'settings.notify.permission.denied'
        : permission === 'unsupported'
          ? 'settings.notify.unsupported'
          : 'settings.notify.permission.default';

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t('settings.notificationHint')}</p>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
        <span className="flex items-center gap-2 text-sm text-ink">
          <BellRing className="h-4 w-4 text-primary" aria-hidden />
          {t('settings.notify.enable')}
        </span>
        <input
          type="checkbox"
          checked={prefs.enabled}
          onChange={(e) => {
            const checked = e.target.checked;
            if (checked && permission === 'default') {
              void enable();
            } else {
              update({ enabled: checked });
            }
          }}
          className="h-4 w-4 accent-[var(--primary)]"
        />
      </label>

      <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
        <span className="text-sm text-ink">{t('settings.notify.leadMinutes')}</span>
        <span className="flex items-center gap-2">
          <select
            value={prefs.leadMinutes}
            onChange={(e) => update({ leadMinutes: Number(e.target.value) })}
            className="rounded-lg border bg-canvas px-2 py-1 text-sm text-ink"
            style={{ borderColor: 'var(--border)' }}
            aria-label={t('settings.notify.leadMinutes')}
          >
            {[5, 10, 15, 30, 60, 120].map((m) => (
              <option key={m} value={m}>{m} {t('settings.notify.leadUnit')}</option>
            ))}
          </select>
        </span>
      </div>

      <p className="text-xs text-muted">{t(permissionKey)}</p>

      <div className="flex flex-wrap gap-2">
        {permission === 'default' && (
          <Button size="sm" onClick={() => void enable()}>
            <BellRing className="h-3.5 w-3.5" aria-hidden /> {t('settings.notify.request')}
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={sendTest} disabled={permission !== 'granted'}>
          <Send className="h-3.5 w-3.5" aria-hidden /> {t('settings.notify.test')}
        </Button>
        {testSent && <span className="self-center text-xs text-success">{t('notifications.enabled')}</span>}
      </div>
    </div>
  );
}
