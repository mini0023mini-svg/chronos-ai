import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sparkles, RotateCw, ShieldCheck, Check, X, AlertTriangle,
  CalendarPlus, Clock3, ListChecks,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useI18n } from '@/hooks/useI18n';
import { useErrorText } from '@/hooks/useErrorText';
import { usePreferences } from '@/hooks/usePreferences';
import { useAsync } from '@/hooks/useAsync';
import { dataService } from '@/services';
import {
  generatePlan,
  confirmPlan,
  type PlanResult,
} from '@/services/planningService';
import type { PlanMode } from '@/lib/planningEngine';
import { formatInZone } from '@/lib/timezone';
import type { PendingAction } from '@/types/models';
import { cn } from '@/lib/utils';

export default function SmartPlanningPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const { timezone } = usePreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const autoTriggered = useRef(false);
  const todayKey = formatInZone(new Date(), 'yyyy-MM-dd', timezone);

  const ctxState = useAsync(
    () => import('@/services/assistantService').then((m) => m.loadAiContext(timezone, todayKey)),
    [timezone, todayKey],
  );
  const categoriesState = useAsync(() => dataService.categories.list(), []);

  const [draft, setDraft] = useState<PlanResult | null>(null);
  const [mode, setMode] = useState<PlanMode>('day');
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const build = async (nextMode: PlanMode) => {
    const ctx = ctxState.data;
    if (!ctx) return;
    setMode(nextMode);
    setGenerating(true);
    setError(null);
    setNotice(null);
    const result = await generatePlan(nextMode, ctx, locale);
    setGenerating(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    setDraft(result.data);
    if (result.data.notice) setNotice(result.data.notice);
    setSelected(Object.fromEntries(result.data.actions.map((a) => [a.id, true])));
  };

  // 从 Dashboard「Plan My Day」跳转来时，数据就绪后自动生成今日计划
  const buildRef = useRef(build);
  buildRef.current = build;
  useEffect(() => {
    const state = location.state as { autoGenerate?: PlanMode } | null;
    if (state?.autoGenerate === 'day' && !autoTriggered.current && ctxState.data && !ctxState.loading) {
      autoTriggered.current = true;
      void buildRef.current('day');
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, ctxState.data, ctxState.loading]);

  const chosen = draft?.actions.filter((a) => selected[a.id] !== false) ?? [];

  const confirm = async () => {
    if (!draft || chosen.length === 0) return;
    setConfirming(true);
    setError(null);
    const result = await confirmPlan(chosen, categoriesState.data ?? []);
    setConfirming(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    setNotice(t('planning.writeSuccess', { n: String(result.data.created) }));
    setDraft(null);
    ctxState.reload();
  };

  const loading = ctxState.loading || categoriesState.loading;
  const loadError = ctxState.error ?? categoriesState.error;

  return (
    <>
      <PageHeader
        title={t('planning.title')}
        subtitle={t('planning.subtitle')}
        actions={<Badge tone="primary">{t('common.phaseTag', { n: 7 })}</Badge>}
      />

      <Card className="mb-5 flex items-start gap-3 border-primary/30 bg-primary/5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="text-xs leading-relaxed text-muted">{t('planning.confirmHint')}</p>
      </Card>

      <div className="mb-5 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void build('day')} disabled={generating || loading}>
          <Sparkles className="h-4 w-4" aria-hidden /> {t('planning.generate')}
        </Button>
        <Button onClick={() => void build('reschedule')} disabled={generating || loading}>
          <RotateCw className="h-4 w-4" aria-hidden /> {t('planning.reschedule')}
        </Button>
      </div>

      {(notice || error) && (
        <div className={cn(
          'mb-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-xs',
          error ? 'border-danger/40 bg-danger/10 text-danger' : 'border-success/40 bg-success/10 text-[#5f8668] dark:text-success',
        )}>
          {error ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="whitespace-pre-wrap">{error ?? notice}</span>
        </div>
      )}

      {loading ? (
        <Card><LoadingState /></Card>
      ) : loadError ? (
        <Card>
          <ErrorState description={errorText(loadError)} onRetry={() => { ctxState.reload(); categoriesState.reload(); }} />
        </Card>
      ) : generating ? (
        <Card><LoadingState label={t('planning.generating')} /></Card>
      ) : !draft ? (
        <EmptyState description={t('planning.empty')} />
      ) : (
        <PlanDraftView
          draft={draft}
          selected={selected}
          onToggle={(id, on) => setSelected((prev) => ({ ...prev, [id]: on }))}
          onSelectAll={(on) => setSelected(Object.fromEntries(draft.actions.map((a) => [a.id, on])))}
          chosenCount={chosen.length}
          confirming={confirming}
          onConfirm={() => void confirm()}
          onRegenerate={() => void build(mode)}
          onDiscard={() => { setDraft(null); setNotice(null); setError(null); }}
          onOpenCalendar={() => navigate('/calendar')}
          timezone={timezone}
        />
      )}
    </>
  );
}

interface PlanDraftViewProps {
  draft: PlanResult;
  selected: Record<string, boolean>;
  onToggle: (id: string, on: boolean) => void;
  onSelectAll: (on: boolean) => void;
  chosenCount: number;
  confirming: boolean;
  onConfirm: () => void;
  onRegenerate: () => void;
  onDiscard: () => void;
  onOpenCalendar: () => void;
  timezone: string;
}

function PlanDraftView({
  draft, selected, onToggle, onSelectAll, chosenCount, confirming,
  onConfirm, onRegenerate, onDiscard, onOpenCalendar, timezone,
}: PlanDraftViewProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold text-ink">{t('planning.draft')}</h2>
            <Badge tone="primary">{t('planning.actionCount', { n: String(draft.actions.length) })}</Badge>
          </div>
          <Badge tone={draft.source === 'ai' ? 'success' : 'neutral'}>
            {draft.source === 'ai' ? t('planning.source.ai') : t('planning.source.local')}
          </Badge>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{draft.summary}</p>
        {draft.conflicts.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{t('ai.conflictHint')}：{draft.conflicts.join('、')}</span>
          </div>
        )}
      </Card>

      {draft.actions.length > 0 ? (
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted">{t('planning.focusBlock')}</p>
            <div className="flex gap-2">
              <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => onSelectAll(true)}>{t('planning.selectAll')}</button>
              <button type="button" className="text-[11px] text-muted hover:underline" onClick={() => onSelectAll(false)}>{t('planning.selectNone')}</button>
            </div>
          </div>
          <ul className="space-y-2">
            {draft.actions.map((action) => (
              <ActionRow
                key={action.id}
                action={action}
                checked={selected[action.id] !== false}
                onToggle={(on) => onToggle(action.id, on)}
                timezone={timezone}
              />
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState description={t('planning.noActions')} />
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={onConfirm} disabled={confirming || chosenCount === 0}>
          <Check className="h-4 w-4" aria-hidden /> {t('planning.confirmWrite')}（{chosenCount}）
        </Button>
        <Button onClick={onRegenerate} disabled={confirming}>
          <RotateCw className="h-4 w-4" aria-hidden /> {t('planning.regenerate')}
        </Button>
        <Button variant="ghost" onClick={onDiscard} disabled={confirming}>
          <X className="h-4 w-4" aria-hidden /> {t('planning.discard')}
        </Button>
        <Button variant="ghost" onClick={onOpenCalendar} disabled={confirming}>
          <CalendarPlus className="h-4 w-4" aria-hidden /> {t('planning.openCalendar')}
        </Button>
      </div>
    </div>
  );
}

function ActionRow({
  action, checked, onToggle, timezone,
}: {
  action: PendingAction;
  checked: boolean;
  onToggle: (on: boolean) => void;
  timezone: string;
}) {
  const p = action.payload;
  const startAt = typeof p.start_at === 'string' ? p.start_at : '';
  const endAt = typeof p.end_at === 'string' ? p.end_at : '';
  const time = startAt
    ? `${formatInZone(startAt, 'MM-dd HH:mm', timezone)} – ${endAt ? formatInZone(endAt, 'HH:mm', timezone) : '?'}`
    : '';

  return (
    <li>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{String(p.title ?? action.description)}</span>
          <span className="mt-1 flex items-center gap-1 text-[11px] text-muted">
            <Clock3 className="h-3 w-3" aria-hidden /> {time}
          </span>
          {action.conflicts.length > 0 && (
            <span className="mt-1 flex items-center gap-1 text-[11px] text-warning">
              <AlertTriangle className="h-3 w-3" aria-hidden /> {action.conflicts.join('、')}
            </span>
          )}
        </span>
        {typeof p.category_name === 'string' && (
          <Badge tone="neutral">{p.category_name}</Badge>
        )}
      </label>
    </li>
  );
}
