import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import {
  UploadCloud, FileText, CheckCircle2, Sparkles, CalendarDays,
  Flag, RefreshCw, Pencil, X,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useI18n } from '@/hooks/useI18n';
import { useErrorText } from '@/hooks/useErrorText';
import { usePreferences } from '@/hooks/usePreferences';
import { useAsync } from '@/hooks/useAsync';
import { useDataSync } from '@/hooks/useDataSync';
import { dataService } from '@/services';
import {
  parseImport, confirmImport, sourceTypeOf, markConflicts,
  type ImportCandidate,
} from '@/services/importService';
import { detectConflicts } from '@/lib/recurrence';
import { formatInZone, fromZoneTime } from '@/lib/timezone';
import type { I18nKey } from '@/i18n';
import type { AiContext } from '@/types/api';
import { cn } from '@/lib/utils';

const SAMPLE = `每周一 09:00-10:30 高等数学 @教学楼A301
每周三 14:00-16:00 数据结构实验 @实验楼B205
周五 10:00 团队周会 @线上
截止 11/30 提交期末论文
完成算法练习题`;

const kindLabel: Record<ImportCandidate['kind'], I18nKey> = {
  create_event: 'import.kind.event',
  create_task: 'import.kind.task',
  create_deadline: 'import.kind.deadline',
};
const kindTone: Record<ImportCandidate['kind'], BadgeTone> = {
  create_event: 'primary',
  create_task: 'success',
  create_deadline: 'warning',
};

export default function AiImportPage() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const { timezone } = usePreferences();
  const [paste, setPaste] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<'ai' | 'local' | null>(null);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [writeResult, setWriteResult] = useState<string | null>(null);

  const eventsState = useAsync(() => dataService.events.list(), []);
  const tasksState = useAsync(() => dataService.tasks.list(), []);
  const deadlinesState = useAsync(() => dataService.deadlines.list(), []);
  useDataSync('all', [eventsState.refresh, tasksState.refresh, deadlinesState.refresh]);
  const categoriesState = useAsync(() => dataService.categories.list(), []);

  const baseLoading = eventsState.loading || tasksState.loading || deadlinesState.loading || categoriesState.loading;
  const baseError = eventsState.error || tasksState.error || deadlinesState.error || categoriesState.error;

  const existingTitles = useMemo(
    () => [
      ...(eventsState.data ?? []).map((e) => e.title),
      ...(tasksState.data ?? []).map((x) => x.title),
      ...(deadlinesState.data ?? []).map((d) => d.title),
    ],
    [eventsState.data, tasksState.data, deadlinesState.data],
  );

  const buildCtx = useCallback((): AiContext => ({
    timezone,
    date: formatInZone(new Date(), 'yyyy-MM-dd', timezone),
    events: eventsState.data ?? [],
    tasks: tasksState.data ?? [],
    deadlines: deadlinesState.data ?? [],
  }), [timezone, eventsState.data, tasksState.data, deadlinesState.data]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    if (picked) {
      setPaste('');
      setWriteResult(null);
    }
  };

  const doParse = async () => {
    const input = file ?? paste.trim();
    if (!input) return;
    setParsing(true);
    setParseError(null);
    setWriteResult(null);
    setNotice(undefined);
    try {
      const result = await parseImport(input, buildCtx(), existingTitles);
      if (!result.ok) {
        setParseError(errorText(result.error));
        setCandidates([]);
        return;
      }
      const withConflicts = markConflicts(result.data.candidates, (c) =>
        detectConflicts(
          { start_at: c.start_at as string, end_at: c.end_at as string, all_day: c.all_day ?? false },
          eventsState.data ?? [],
        ).map((ev) => ev.title),
      );
      setCandidates(withConflicts);
      setSelected(new Set(withConflicts.filter((c) => !c.flags.missingDate).map((c) => c.id)));
      setSource(result.data.source);
      setNotice(result.data.notice);
    } catch (err) {
      setParseError(errorText(err));
      setCandidates([]);
    } finally {
      setParsing(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const patchCandidate = (id: string, patch: Partial<ImportCandidate>) => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  /** 用户补充日期：重新计算 due_at / start_at+end_at（按全局时区） */
  const applyDate = (c: ImportCandidate, date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (c.kind === 'create_event') {
      const sh = c.start_at ? Number(formatInZone(c.start_at, 'HH', timezone)) : 9;
      const sm = c.start_at ? Number(formatInZone(c.start_at, 'mm', timezone)) : 0;
      const eh = c.end_at ? Number(formatInZone(c.end_at, 'HH', timezone)) : sh + 1;
      const em = c.end_at ? Number(formatInZone(c.end_at, 'mm', timezone)) : sm;
      patchCandidate(c.id, {
        start_at: fromZoneTime(`${date}T${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`, timezone).toISOString(),
        end_at: fromZoneTime(`${date}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`, timezone).toISOString(),
        flags: { ...c.flags, missingDate: false },
        needsConfirm: false,
      });
    } else {
      patchCandidate(c.id, {
        due_at: fromZoneTime(`${date}T23:59:00`, timezone).toISOString(),
        flags: { ...c.flags, missingDate: false },
        needsConfirm: false,
      });
    }
    setSelected((prev) => new Set(prev).add(c.id));
  };

  const doWrite = async () => {
    if (selected.size === 0) return;
    setWriting(true);
    setWriteResult(null);
    try {
      const result = await confirmImport(candidates, [...selected], buildCtx(), categoriesState.data ?? []);
      if (!result.ok) {
        setParseError(errorText(result.error));
        return;
      }
      setWriteResult(t('import.writeSuccess', { n: result.data.created }));
      eventsState.reload();
      tasksState.reload();
      deadlinesState.reload();
      setCandidates([]);
      setSelected(new Set());
      setSource(null);
    } finally {
      setWriting(false);
    }
  };

  const allSelected = candidates.length > 0 && selected.size === candidates.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(candidates.map((c) => c.id)));

  const flagLabels: Record<string, string> = {
    conflict: t('import.conflicts'),
    missingDate: t('import.missingDate'),
    duplicate: t('import.duplicate'),
  };
  const flagTones: Record<string, BadgeTone> = {
    conflict: 'danger',
    missingDate: 'warning',
    duplicate: 'neutral',
  };

  if (baseLoading) return <LoadingState />;
  if (baseError) return <ErrorState description={errorText(baseError)} onRetry={() => { eventsState.reload(); tasksState.reload(); deadlinesState.reload(); categoriesState.reload(); }} />;

  return (
    <>
      <PageHeader
        title={t('import.title')}
        subtitle={t('import.subtitle')}
        actions={
          <Badge tone="primary">
            <Sparkles className="mr-1 h-3 w-3" aria-hidden /> {t('common.phaseTag', { n: 5 })}
          </Badge>
        }
      />

      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary/8 p-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="text-xs leading-relaxed text-muted">
          {source === 'ai' ? t('import.aiMode') : t('import.localModeHint')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <label
            className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed text-center transition hover:bg-primary/5"
            style={{ borderColor: 'var(--border)' }}
          >
            <UploadCloud className="h-8 w-8 text-primary" aria-hidden />
            <span className="text-sm font-medium text-ink">{t('import.dropzone')}</span>
            <span className="text-[11px] text-muted">{t('import.formats')}</span>
            <input type="file" accept=".jpg,.jpeg,.png,.pdf,.docx,.xlsx,.txt" onChange={onFile} className="hidden" />
            {file && (
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-3 py-1 text-xs text-primary">
                <FileText className="h-3.5 w-3.5" aria-hidden /> {file.name} ({sourceTypeOf(file).toUpperCase()})
                <button type="button" onClick={() => setFile(null)} aria-label="remove" className="ml-1"><X className="h-3 w-3" /></button>
              </span>
            )}
          </label>

          <div className="my-4 flex items-center gap-3 text-[11px] text-muted">
            <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
            OR
            <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
          </div>

          <div className="mb-2 flex items-center justify-between">
            <textarea
              value={paste}
              onChange={(e) => { setPaste(e.target.value); if (e.target.value) setFile(null); }}
              placeholder={t('import.paste')}
              rows={6}
              className="w-full resize-y rounded-xl border bg-card p-3 text-sm text-ink placeholder:text-muted/70 focus:outline focus:outline-2 focus:outline-primary/50"
              style={{ borderColor: 'var(--border)' }}
              aria-label={t('import.paste')}
            />
          </div>
          <button type="button" onClick={() => { setPaste(SAMPLE); setFile(null); }} className="text-[11px] text-primary hover:underline">
            {t('import.sample')}
          </button>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void doParse()} disabled={parsing || (!file && !paste.trim())}>
              {parsing ? <><RefreshCw className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> {t('import.parsing')}</> : <><Sparkles className="mr-1.5 h-4 w-4" aria-hidden /> {t('import.parse')}</>}
            </Button>
            {notice && <span className="text-[11px] text-warning">{notice}</span>}
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">{t('import.preview')}</h2>
            <div className="flex items-center gap-2">
              {source && (
                <Badge tone={source === 'ai' ? 'success' : 'primary'}>
                  {t(source === 'ai' ? 'import.source.ai' : 'import.source.local')}
                </Badge>
              )}
              {candidates.length > 0 && (
                <button type="button" onClick={toggleAll} className="text-[11px] text-primary hover:underline">
                  {allSelected ? t('import.selectNone') : t('import.selectAll')}
                </button>
              )}
            </div>
          </div>

          {parseError && <div className="mb-3"><ErrorState description={parseError} onRetry={() => void doParse()} /></div>}
          {writeResult && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 p-3 text-xs text-[#5f8668]">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> {writeResult}
            </div>
          )}

          {candidates.length === 0 ? (
            <EmptyState description={t('import.empty')} />
          ) : (
            <>
              <p className="mb-3 text-[11px] text-muted">{t('import.confirmHint')}</p>
              <ul className="max-h-[540px] space-y-2 overflow-y-auto pr-1">
                {candidates.map((c) => {
                  const checked = selected.has(c.id);
                  return (
                    <li
                      key={c.id}
                      className={cn(
                        'rounded-xl border p-3 transition',
                        checked ? 'border-primary/50 bg-primary/5' : 'opacity-70',
                      )}
                      style={!checked ? { borderColor: 'var(--border)' } : undefined}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(c.id)}
                          className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--primary)]"
                          aria-label={`${t('import.selected')} ${c.title}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-medium text-ink">{c.title}</p>
                            <Badge tone={kindTone[c.kind]}>{t(kindLabel[c.kind])}</Badge>
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                            {c.kind === 'create_event' && c.start_at && (
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" aria-hidden />
                                {formatInZone(c.start_at, 'MM-dd HH:mm', timezone)}
                                {c.end_at ? ` – ${formatInZone(c.end_at, 'HH:mm', timezone)}` : ''}
                              </span>
                            )}
                            {c.kind !== 'create_event' && c.due_at && (
                              <span className="inline-flex items-center gap-1">
                                <Flag className="h-3 w-3" aria-hidden />
                                {t('deadlines.dueAt')}: {formatInZone(c.due_at, 'MM-dd HH:mm', timezone)}
                              </span>
                            )}
                            <span>{t('import.confidence')} {Math.round(c.confidence * 100)}%</span>
                            {c.recurrence && <Badge tone="neutral">{t('import.recurring')}</Badge>}
                            {c.needsConfirm && <Badge tone="warning">{t('import.needsConfirm')}</Badge>}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {Object.entries(c.flags).map(([flag, on]) =>
                              on ? <Badge key={flag} tone={flagTones[flag] ?? 'neutral'}>{flagLabels[flag]}</Badge> : null,
                            )}
                          </div>
                          {c.conflicts.length > 0 && (
                            <p className="mt-1 text-[11px] text-danger">{t('import.conflicts')}: {c.conflicts.join('、')}</p>
                          )}

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-1 text-[11px] text-muted">
                              <Pencil className="h-3 w-3" aria-hidden /> {t('import.editTitle')}
                              <input
                                value={c.title}
                                onChange={(e) => patchCandidate(c.id, { title: e.target.value })}
                                className="w-36 rounded-lg border bg-card px-2 py-1 text-xs text-ink"
                                style={{ borderColor: 'var(--border)' }}
                              />
                            </label>
                            <label className="inline-flex items-center gap-1 text-[11px] text-muted">
                              {t('import.editDate')}
                              <input
                                type="date"
                                value={
                                  (c.kind === 'create_event' ? c.start_at : c.due_at)
                                    ? formatInZone((c.kind === 'create_event' ? c.start_at : c.due_at) as string, 'yyyy-MM-dd', timezone)
                                    : ''
                                }
                                onChange={(e) => applyDate(c, e.target.value)}
                                placeholder={t('import.datePlaceholder')}
                                className="rounded-lg border bg-card px-2 py-1 text-xs text-ink"
                                style={{ borderColor: 'var(--border)' }}
                              />
                            </label>
                          </div>
                          <p className="mt-2 truncate text-[10px] text-muted" title={c.source}>{t('import.rawText')}: {c.source}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs text-muted">{t('import.selected', { n: selected.size })}</span>
                <Button variant="primary" onClick={() => void doWrite()} disabled={writing || selected.size === 0}>
                  {writing ? <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />}
                  {t('import.confirmWrite')}
                </Button>
              </div>
              {candidates.some((c) => c.flags.missingDate) && (
                <p className="mt-2 text-[11px] text-warning">{t('import.skipMissing')}</p>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
