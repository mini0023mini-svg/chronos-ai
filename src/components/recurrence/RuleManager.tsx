import { useCallback, useEffect, useState } from 'react';
import { Repeat2, Ban } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/hooks/useI18n';
import { useErrorText } from '@/hooks/useErrorText';
import { dataService } from '@/services';
import type { RecurringRule } from '@/types/models';
import type { I18nKey } from '@/i18n';
import { recurrenceLabel } from '@/lib/recurrence';

const FREQ_LABEL: Record<RecurringRule['freq'], I18nKey> = {
  daily: 'calendar.recurrence.daily',
  weekly: 'calendar.recurrence.weekly',
  monthly: 'calendar.recurrence.monthly',
  yearly: 'calendar.recurrence.yearly',
};

/** 重复规则管理：查看所有规则，停用（superseded_by）规则 */
export function RuleManager() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const result = await dataService.recurringRules.list();
    if (result.ok) setRules(result.data);
    else setError(errorText(result.error));
    setLoading(false);
  }, [errorText]);

  useEffect(() => {
    void load();
  }, [load]);

  const disable = async (rule: RecurringRule) => {
    // 停用 = 标记 superseded_by 为自身 id（表示已被取代，不再生成新实例）
    const result = await dataService.recurringRules.update(rule.id, { superseded_by: rule.id });
    if (result.ok) await load();
    else setError(errorText(result.error));
  };

  if (loading) return <p className="text-xs text-muted">{t('common.loading')}</p>;
  if (error) return <p className="rounded-xl bg-danger/10 px-4 py-2 text-xs text-danger">{error}</p>;
  if (rules.length === 0) return <EmptyState description={t('rules.empty')} />;

  return (
    <div className="space-y-2">
      {rules.map((rule) => {
        const disabled = Boolean(rule.superseded_by);
        return (
          <div key={rule.id} className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: 'var(--border)' }}>
            <Repeat2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{rule.title}</p>
              <p className="text-[11px] text-muted">
                {t(FREQ_LABEL[rule.freq])} · {recurrenceLabel(rule)}
                {rule.end_date ? ` · ${t('calendar.recurrence.until')} ${rule.end_date}` : ''}
                {rule.count ? ` · ${rule.count} ${t('calendar.recurrence.times')}` : ''}
              </p>
            </div>
            <Badge tone={disabled ? 'neutral' : 'success'}>{disabled ? t('rules.disabled') : t('rules.active')}</Badge>
            {!disabled && (
              <Button size="sm" variant="ghost" onClick={() => void disable(rule)} title={t('rules.disable')}>
                <Ban className="h-3.5 w-3.5" aria-hidden /> {t('rules.disable')}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
