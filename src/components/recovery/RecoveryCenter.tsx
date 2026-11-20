import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/hooks/useI18n';
import { useErrorText } from '@/hooks/useErrorText';
import { usePreferences } from '@/hooks/usePreferences';
import { dataService } from '@/services';
import type { BaseEntity } from '@/types/models';
import type { CrudRepo } from '@/types/api';
import type { I18nKey } from '@/i18n';
import { formatInZone } from '@/lib/timezone';

type EntityKind = 'events' | 'tasks' | 'deadlines';
interface DeletedRow {
  kind: EntityKind;
  id: string;
  title: string;
  deletedAt: string;
}

const KIND_LABEL: Record<EntityKind, I18nKey> = {
  events: 'nav.calendar',
  tasks: 'nav.tasks',
  deadlines: 'nav.deadlines',
};

/** 软删除恢复中心：汇总日程 / 任务 / 截止的已删除项，支持恢复 */
export function RecoveryCenter() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const { timezone } = usePreferences();
  const [kind, setKind] = useState<EntityKind | 'all'>('all');
  const [rows, setRows] = useState<DeletedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    interface NamedRow extends BaseEntity {
      title: string;
    }
    const repos: { kind: EntityKind; repo: CrudRepo<NamedRow> }[] = [
      { kind: 'events', repo: dataService.events as CrudRepo<NamedRow> },
      { kind: 'tasks', repo: dataService.tasks as CrudRepo<NamedRow> },
      { kind: 'deadlines', repo: dataService.deadlines as CrudRepo<NamedRow> },
    ];
    const collected: DeletedRow[] = [];
    for (const { kind: k, repo } of repos) {
      if (!repo.listDeleted) continue;
      const result = await repo.listDeleted();
      if (!result.ok) {
        setError(errorText(result.error));
        continue;
      }
      result.data.forEach((item) => {
        collected.push({
          kind: k,
          id: item.id,
          title: item.title,
          deletedAt: item.deleted_at ?? item.updated_at,
        });
      });
    }
    setRows(collected.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()));
    setLoading(false);
  }, [errorText]);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (row: DeletedRow) => {
    const repo = dataService[row.kind];
    const result = await repo.restore(row.id);
    if (result.ok) await load();
    else setError(errorText(result.error));
  };

  const filtered = rows.filter((row) => kind === 'all' || row.kind === kind);

  return (
    <div className="space-y-4">
      <Select label={t('history.filter.module')} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
        <option value="all">{t('common.all')}</option>
        {(Object.keys(KIND_LABEL) as EntityKind[]).map((k) => <option key={k} value={k}>{t(KIND_LABEL[k])}</option>)}
      </Select>

      {error && <p className="rounded-xl bg-danger/10 px-4 py-2 text-xs text-danger">{error}</p>}

      {loading ? (
        <p className="text-xs text-muted">{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        <EmptyState description={t('recovery.empty')} />
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <div key={`${row.kind}-${row.id}`} className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: 'var(--border)' }}>
              <Trash2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{row.title}</p>
                <p className="text-[11px] text-muted">{formatInZone(row.deletedAt, 'yyyy-MM-dd HH:mm', timezone)}</p>
              </div>
              <Badge tone="neutral">{t(KIND_LABEL[row.kind])}</Badge>
              <Button size="sm" onClick={() => void restore(row)}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {t('history.restore')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
