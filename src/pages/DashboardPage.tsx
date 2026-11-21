import { useMemo } from 'react';
import { CalendarDays, ListTodo, Clock3, Flag, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/hooks/useI18n';
import { useErrorText } from '@/hooks/useErrorText';
import { useAsync } from '@/hooks/useAsync';
import { useDataSync } from '@/hooks/useDataSync';
import { usePreferences } from '@/hooks/usePreferences';
import { dataService } from '@/services';
import { formatInZone } from '@/lib/timezone';

export default function DashboardPage() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const { timezone } = usePreferences();

  const eventsState = useAsync(() => dataService.events.list(), []);
  const tasksState = useAsync(() => dataService.tasks.list(), []);
  const deadlinesState = useAsync(() => dataService.deadlines.list(), []);
  const profileState = useAsync(() => dataService.profiles.get(), []);
  useDataSync('all', [eventsState.refresh, tasksState.refresh, deadlinesState.refresh]);

  const todayKey = formatInZone(new Date(), 'yyyy-MM-dd', timezone);

  const stats = useMemo(() => {
    const events = eventsState.data ?? [];
    const tasks = tasksState.data ?? [];
    const deadlines = deadlinesState.data ?? [];
    const todayEvents = events.filter((e) => !e.is_cancelled && (e.occurrence_date ?? e.start_at.slice(0, 10)) === todayKey);
    const pendingTasks = tasks.filter((t2) => !t2.is_completed);
    const todayTasks = pendingTasks.filter((t2) => t2.due_at?.slice(0, 10) === todayKey);
    const upcoming = deadlines
      .filter((d) => d.status !== 'finished' && new Date(d.due_at).getTime() >= Date.now())
      .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())[0];
    const completedThisWeek = tasks.filter((t2) => t2.is_completed && t2.completed_at).length;
    const rate = tasks.length ? Math.round((completedThisWeek / tasks.length) * 100) : 0;
    return { todayEvents, todayTasks, pendingTasks, upcoming, rate };
  }, [eventsState.data, tasksState.data, deadlinesState.data, todayKey]);

  const loading = eventsState.loading || tasksState.loading || deadlinesState.loading || profileState.loading;
  const error = eventsState.error ?? tasksState.error ?? deadlinesState.error ?? profileState.error;

  return (
    <>
      <PageHeader
        title={t('app.name')}
        subtitle={`${t('dashboard.subtitle')} · ${formatInZone(new Date(), 'yyyy-MM-dd EEEE', timezone)}`}
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="h-24 animate-pulse bg-muted/10" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <EmptyState
            description={errorText(error)}
            action={
              <Button size="sm" onClick={() => { eventsState.reload(); tasksState.reload(); deadlinesState.reload(); }}>
                {t('common.retry')}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard icon={CalendarDays} label={t('dashboard.stat.todayEvents')} value={String(stats.todayEvents.length)} tone="primary" />
            <StatCard icon={ListTodo} label={t('dashboard.stat.todayTasks')} value={String(stats.todayTasks.length)} tone="success" />
            <StatCard icon={Clock3} label={t('dashboard.stat.pendingTasks')} value={String(stats.pendingTasks.length)} tone="warning" />
            <StatCard icon={Flag} label={t('dashboard.stat.nearestDeadline')} value={stats.upcoming ? formatInZone(stats.upcoming.due_at, 'MM-dd', timezone) : '—'} tone="danger" />
            <StatCard icon={TrendingUp} label={t('dashboard.stat.completionRate')} value={`${stats.rate}%`} tone="primary" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-ink">{t('dashboard.todayEvents')}</h2>
              {stats.todayEvents.length === 0 ? (
                <EmptyState description={t('dashboard.noEvents')} />
              ) : (
                <ul className="space-y-2">
                  {stats.todayEvents.map((e) => (
                    <li key={e.id} className="flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{e.title}</p>
                        <p className="text-xs text-muted">{e.location ?? ''}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted">{formatInZone(e.start_at, 'HH:mm', timezone)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="mb-3 text-sm font-semibold text-ink">{t('dashboard.todayTasks')}</h2>
              {stats.todayTasks.length === 0 ? (
                <EmptyState description={t('dashboard.noTasks')} />
              ) : (
                <ul className="space-y-2">
                  {stats.todayTasks.map((task) => (
                    <li key={task.id} className="flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
                      <p className="truncate text-sm font-medium text-ink">{task.title}</p>
                      <Badge tone={task.priority === 'urgent' ? 'danger' : task.priority === 'high' ? 'warning' : 'neutral'}>
                        {t(`tasks.priority.${task.priority}` as const)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof CalendarDays; label: string; value: string; tone: 'primary' | 'success' | 'warning' | 'danger' }) {
  const toneClass = {
    primary: 'bg-primary/12 text-primary',
    success: 'bg-success/20 text-[#5f8668]',
    warning: 'bg-warning/25 text-[#9a7a2f]',
    danger: 'bg-danger/15 text-danger',
  }[tone];
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] text-muted">{label}</p>
        <p className="truncate text-lg font-semibold text-ink">{value}</p>
      </div>
    </Card>
  );
}
