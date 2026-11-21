import { useMemo, useState } from 'react';
import { History as HistoryIcon, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { AsyncView } from '@/components/AsyncView';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { RecoveryCenter } from '@/components/recovery/RecoveryCenter';
import { useI18n } from '@/hooks/useI18n';
import { useAsync } from '@/hooks/useAsync';
import { usePreferences } from '@/hooks/usePreferences';
import { dataService } from '@/services';
import type { I18nKey } from '@/i18n';
import type { ActionType, ModuleKey } from '@/types/enums';
import { formatInZone } from '@/lib/timezone';
import { cn } from '@/lib/utils';

const MODULES: ModuleKey[] = ['dashboard', 'calendar', 'tasks', 'ai_assistant', 'ai_import', 'deadlines', 'notifications', 'history', 'settings'];
const ACTIONS: ActionType[] = ['create', 'update', 'delete', 'restore', 'confirm', 'complete', 'import'];

const moduleLabelKey: Record<ModuleKey, I18nKey> = {
  dashboard: 'nav.dashboard',
  calendar: 'nav.calendar',
  tasks: 'nav.tasks',
  ai_assistant: 'nav.aiAssistant',
  ai_import: 'nav.aiImport',
  deadlines: 'nav.deadlines',
  smart_planning: 'nav.smartPlanning',
  notifications: 'nav.notifications',
  history: 'nav.history',
  settings: 'nav.settings',
};

const actionTone: Record<ActionType, BadgeTone> = {
  create: 'primary',
  update: 'neutral',
  delete: 'danger',
  restore: 'success',
  confirm: 'primary',
  complete: 'success',
  import: 'warning',
};

type Tab = 'activity' | 'deleted';

export default function HistoryPage() {
  const { t } = useI18n();
  const { timezone } = usePreferences();
  const logsState = useAsync(() => dataService.activityLogs.list(), []);
  const [tab, setTab] = useState<Tab>('activity');
  const [moduleFilter, setModuleFilter] = useState<'all' | ModuleKey>('all');
  const [actionFilter, setActionFilter] = useState<'all' | ActionType>('all');

  const filtered = useMemo(() => {
    return (logsState.data ?? []).filter((l) => {
      const mOk = moduleFilter === 'all' || l.module === moduleFilter;
      const aOk = actionFilter === 'all' || l.action === actionFilter;
      return mOk && aOk;
    });
  }, [logsState.data, moduleFilter, actionFilter]);

  return (
    <>
      <PageHeader title={t('history.title')} subtitle={t('history.subtitle')} />

      <div className="mb-4 flex gap-1.5" role="tablist" aria-label={t('history.title')}>
        {(['activity', 'deleted'] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'rounded-xl px-4 py-2 text-sm transition',
              tab === key ? 'bg-primary font-medium text-white' : 'bg-card text-muted hover:text-ink',
            )}
            style={tab === key ? undefined : { borderColor: 'var(--border)', borderWidth: 1 }}
          >
            {t(key === 'activity' ? 'history.tab.activity' : 'history.tab.deleted')}
          </button>
        ))}
      </div>

      {tab === 'deleted' ? (
        <>
          <p className="mb-4 text-xs text-muted">{t('recovery.hint')}</p>
          <RecoveryCenter />
          <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted">
            <HistoryIcon className="h-3.5 w-3.5" aria-hidden /> {t('common.phaseTag', { n: 4 })} — {t('history.subtitle')}
          </p>
        </>
      ) : (
      <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select label={t('history.filter.module')} value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value as typeof moduleFilter)}>
          <option value="all">{t('common.all')}</option>
          {MODULES.map((m) => <option key={m} value={m}>{t(moduleLabelKey[m])}</option>)}
        </Select>
        <Select label={t('history.filter.action')} value={actionFilter} onChange={(e) => setActionFilter(e.target.value as typeof actionFilter)}>
          <option value="all">{t('common.all')}</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{t(`history.action.${a}` as const)}</option>)}
        </Select>
      </div>

      <AsyncView state={logsState} isEmpty={() => true} empty={<EmptyState description={t('history.empty')} />}>
        {() => {
          if (filtered.length === 0) return <EmptyState description={t('history.empty')} />;
          return (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted" style={{ borderColor: 'var(--border)' }}>
                    <th className="px-5 py-3 font-medium">{t('history.filter.time')}</th>
                    <th className="px-5 py-3 font-medium">{t('history.filter.module')}</th>
                    <th className="px-5 py-3 font-medium">{t('history.filter.action')}</th>
                    <th className="px-5 py-3 font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => (
                    <tr key={log.id} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">{formatInZone(log.created_at, 'yyyy-MM-dd HH:mm', timezone)}</td>
                      <td className="px-5 py-3 text-ink">{t(moduleLabelKey[log.module])}</td>
                      <td className="px-5 py-3"><Badge tone={actionTone[log.action]}>{t(`history.action.${log.action}` as const)}</Badge></td>
                      <td className="px-5 py-3">
                        <Button size="sm" variant="ghost" disabled>
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {t('history.restore')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        }}
      </AsyncView>

      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted">
        <HistoryIcon className="h-3.5 w-3.5" aria-hidden /> {t('recovery.hint')}
      </p>
      </>
      )}
    </>
  );
}
