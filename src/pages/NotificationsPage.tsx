import { useState } from 'react';
import { Bell, BellRing, CheckCheck, Send } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { AsyncView } from '@/components/AsyncView';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/hooks/useI18n';
import { useAsync } from '@/hooks/useAsync';
import { useDataSync } from '@/hooks/useDataSync';
import { usePreferences } from '@/hooks/usePreferences';
import { dataService } from '@/services';
import { formatInZone } from '@/lib/timezone';
import {
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
  showBrowserNotification,
  getNotifyPreferences,
  saveNotifyPreferences,
  type NotificationPermissionState,
} from '@/lib/notification';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const { t } = useI18n();
  const { timezone } = usePreferences();
  const notesState = useAsync(() => dataService.notifications.list(), []);
  const [permission, setPermission] = useState<NotificationPermissionState>(getNotificationPermission);
  useDataSync('notifications', notesState.refresh);

  const markAllRead = async () => {
    const list = notesState.data ?? [];
    await Promise.all(list.filter((n) => !n.is_read).map((n) => dataService.notifications.update(n.id, { is_read: true })));
    notesState.reload();
  };

  const enable = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted' || result === 'unsupported') {
      saveNotifyPreferences({ ...getNotifyPreferences(), enabled: true });
    }
  };

  const sendTest = () => {
    showBrowserNotification(t('notifications.testTitle'), t('notifications.testBody'), 'chronos-test');
  };

  return (
    <>
      <PageHeader
        title={t('notifications.title')}
        subtitle={t('notifications.subtitle')}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {permission !== 'granted' && isNotificationSupported() && (
              <Button size="sm" onClick={() => void enable()}>
                <BellRing className="h-4 w-4" aria-hidden />
                {t('notifications.enableBrowser')}
              </Button>
            )}
            {permission === 'granted' && (
              <Button size="sm" variant="secondary" onClick={sendTest}>
                <Send className="h-4 w-4" aria-hidden />
                {t('notifications.test')}
              </Button>
            )}
            <Button size="sm" onClick={() => void markAllRead()} disabled={!notesState.data?.some((n) => !n.is_read)}>
              <CheckCheck className="h-4 w-4" aria-hidden />
              {t('notifications.markRead')}
            </Button>
          </div>
        }
      />

      {permission === 'default' && (
        <p className="mb-4 text-xs text-muted">{t('notifications.permissionHint')}</p>
      )}

      <AsyncView state={notesState} isEmpty={() => true} empty={<EmptyState description={t('notifications.empty')} />}>
        {(notes) => {
          if (notes.length === 0) return <EmptyState description={t('notifications.empty')} />;
          return (
            <div className="space-y-2">
              {notes.map((n) => (
                <Card key={n.id} className={cn('flex items-start gap-3', !n.is_read && 'border-primary/40 bg-primary/5')}>
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    {n.is_read ? <Bell className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{n.title}</p>
                      <div className="flex items-center gap-2">
                        {!n.is_read && <Badge tone="primary">{t('notifications.unread')}</Badge>}
                        <span className="text-[11px] text-muted">{formatInZone(n.created_at, 'MM-dd HH:mm', timezone)}</span>
                      </div>
                    </div>
                    {n.body && <p className="mt-1 text-xs text-muted">{n.body}</p>}
                  </div>
                </Card>
              ))}
            </div>
          );
        }}
      </AsyncView>
    </>
  );
}
