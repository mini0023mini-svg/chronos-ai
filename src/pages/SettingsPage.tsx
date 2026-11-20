import { UserRound, Languages, Palette, Clock3, Cloud, BellRing, Database, Trash2, LogOut, Repeat2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { RecoveryCenter } from '@/components/recovery/RecoveryCenter';
import { RuleManager } from '@/components/recurrence/RuleManager';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/hooks/usePreferences';
import { useSync } from '@/context/SyncContext';
import { TIMEZONE_OPTIONS, isValidTimeZone, formatInZone } from '@/lib/timezone';
import type { Locale, ThemeMode } from '@/types/enums';

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const { timezone, setTimezone } = usePreferences();
  const sync = useSync();

  const syncStatusKey = sync.cloudEnabled
    ? `settings.sync.status.${sync.status}` as const
    : 'settings.sync.local' as const;
  const SyncIcon = sync.status === 'subscribed' || !sync.cloudEnabled ? Wifi : WifiOff;

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section icon={UserRound} title={t('settings.account')} badge={<Badge tone="success">{t('common.phaseTag', { n: 2 })}</Badge>}>
          <InfoRow label="Email" value={user?.email ?? '—'} />
          {user?.display_name && <InfoRow label="Name" value={user.display_name} />}
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted">{t('settings.accountHint')}</p>
            <Button size="sm" onClick={() => void signOut()}>
              <LogOut className="h-3.5 w-3.5" aria-hidden /> {t('header.signOut')}
            </Button>
          </div>
        </Section>

        <Section icon={Languages} title={t('settings.language')}>
          <Select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} aria-label={t('settings.language')}>
            <option value="zh-CN">简体中文</option>
            <option value="en-US">English</option>
          </Select>
        </Section>

        <Section icon={Palette} title={t('settings.theme')}>
          <Select value={theme} onChange={(e) => setTheme(e.target.value as ThemeMode)} aria-label={t('settings.theme')}>
            <option value="light">{t('settings.theme.light')}</option>
            <option value="dark">{t('settings.theme.dark')}</option>
            <option value="system">{t('settings.theme.system')}</option>
          </Select>
        </Section>

        <Section icon={Clock3} title={t('settings.timezone')} badge={<Badge tone="success">{t('common.phaseTag', { n: 4 })}</Badge>}>
          <Select
            value={timezone}
            onChange={(e) => {
              if (isValidTimeZone(e.target.value)) void setTimezone(e.target.value);
            }}
            aria-label={t('settings.timezone')}
          >
            {TIMEZONE_OPTIONS.filter(isValidTimeZone).map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </Select>
          <p className="mt-2 text-xs text-muted">{t('settings.timezoneHint')}</p>
        </Section>

        <Section icon={Cloud} title={t('settings.sync')} badge={<Badge tone="success">{t('common.phaseTag', { n: 8 })}</Badge>}>
          <div className="flex items-center gap-2">
            <SyncIcon className="h-4 w-4 text-primary" aria-hidden />
            <p className="text-sm text-ink">{t(syncStatusKey)}</p>
          </div>
          <p className="mt-1 text-xs text-muted">
            {t(sync.cloudEnabled ? 'settings.sync.cloud' : 'settings.sync.local')}
          </p>
          {sync.lastSyncAt && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <RefreshCw className="h-3 w-3" aria-hidden />
              {t('settings.sync.lastAt', { time: formatInZone(new Date(sync.lastSyncAt).toISOString(), 'HH:mm:ss', timezone) })}
            </p>
          )}
        </Section>

        <Section icon={BellRing} title={t('settings.notification')} badge={<Badge tone="success">{t('common.phaseTag', { n: 8 })}</Badge>}>
          <NotificationSettings />
        </Section>

        <Section icon={Repeat2} title={t('settings.recurringRules')} badge={<Badge tone="success">{t('common.phaseTag', { n: 4 })}</Badge>}>
          <p className="mb-3 text-xs text-muted">{t('rules.hint')}</p>
          <RuleManager />
        </Section>

        <Section icon={Database} title={t('settings.data')} badge={<Badge tone="primary">{t('common.phaseTag', { n: 9 })}</Badge>}>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{t('settings.export')}</Badge>
            <Badge tone="neutral">{t('settings.import')}</Badge>
          </div>
          <p className="mt-2 text-xs text-muted">{t('settings.dataHint')}</p>
        </Section>

        <Section icon={Trash2} title={t('settings.restoreEntry')} badge={<Badge tone="success">{t('common.phaseTag', { n: 4 })}</Badge>}>
          <p className="mb-3 text-xs text-muted">{t('recovery.hint')}</p>
          <RecoveryCenter />
        </Section>
      </div>
    </>
  );
}

function Section({ icon: Icon, title, badge, children }: { icon: typeof UserRound; title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {badge}
      </div>
      {children}
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-1 py-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="truncate text-sm text-ink">{value}</span>
    </div>
  );
}
