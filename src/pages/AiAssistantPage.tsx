import { useEffect, useRef, useState } from 'react';
import {
  Bot, User, Send, AlertTriangle, ShieldCheck, Check, X,
  CalendarPlus, ListTodo, Flag, Sparkles, Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useI18n } from '@/hooks/useI18n';
import { useErrorText } from '@/hooks/useErrorText';
import { usePreferences } from '@/hooks/usePreferences';
import { useAsync } from '@/hooks/useAsync';
import { dataService } from '@/services';
import {
  assistantService,
  sendChatMessage,
  confirmPendingActions,
  type ChatSource,
} from '@/services/assistantService';
import { describePendingAction, resolveConfirmedMessages } from '@/lib/assistantEngine';
import { formatInZone } from '@/lib/timezone';
import type { ChatMessage, PendingAction, AiConversation } from '@/types/models';
import { cn } from '@/lib/utils';
import type { I18nKey } from '@/i18n';

const QUICK_PROMPTS: Array<{ icon: typeof Sparkles; key: I18nKey; textZh: string; textEn: string }> = [
  { icon: CalendarPlus, key: 'ai.quick.schedule', textZh: '今天有什么安排？', textEn: 'What is on my schedule today?' },
  { icon: Sparkles, key: 'ai.quick.free', textZh: '明天下午有空吗？', textEn: 'Am I free tomorrow afternoon?' },
  { icon: CalendarPlus, key: 'ai.quick.event', textZh: '明天 14:00-15:00 和张三开会', textEn: 'Meeting with Tom tomorrow 2pm-3pm' },
  { icon: ListTodo, key: 'ai.quick.task', textZh: '创建任务：买牛奶', textEn: 'Create a task: buy milk' },
];

const actionIcon: Record<PendingAction['kind'], typeof CalendarPlus> = {
  create_event: CalendarPlus,
  update_event: CalendarPlus,
  create_task: ListTodo,
  update_task: ListTodo,
  create_deadline: Flag,
};

export default function AiAssistantPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const { timezone } = usePreferences();
  const todayKey = formatInZone(new Date(), 'yyyy-MM-dd', timezone);

  const ctxState = useAsync(() => assistantService.loadAiContext(timezone, todayKey), [timezone, todayKey]);
  const categoriesState = useAsync(() => dataService.categories.list(), []);
  const convState = useAsync(() => dataService.conversations.list(), []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 会话加载：取最近一条 active 会话；无则用引导语初始化内存态
  useEffect(() => {
    if (convState.loading || convState.error) return;
    const rows = convState.data ?? [];
    if (rows.length === 0) return;
    const conv = rows[0];
    convIdRef.current = conv.id;
    if (conv.messages?.length) {
      setMessages(conv.messages);
    } else {
      setMessages([{ role: 'assistant', content: assistantService.greeting(locale), ts: new Date().toISOString(), source: 'local' }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convState.loading, convState.data]);

  // 滚动到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const persist = async (next: ChatMessage[]) => {
    const pending = next.filter((m) => m.pendingActions?.length && !m.resolved).flatMap((m) => m.pendingActions ?? []);
    if (convIdRef.current) {
      await dataService.conversations.update(convIdRef.current, {
        messages: next,
        pending_actions: pending,
      } as Partial<AiConversation>);
    } else {
      const created = await dataService.conversations.create({
        title: locale === 'zh-CN' ? 'AI 对话' : 'AI conversation',
        messages: next,
        pending_actions: pending,
        status: 'active',
      } as Partial<AiConversation>);
      if (created.ok) convIdRef.current = created.data.id;
    }
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || sending) return;
    setInput('');
    setError(null);
    setNotice(null);

    const userMsg: ChatMessage = { role: 'user', content: text, ts: new Date().toISOString() };
    const base = messages.length === 0
      ? [{ role: 'assistant' as const, content: assistantService.greeting(locale), ts: new Date().toISOString(), source: 'local' as ChatSource }, userMsg]
      : [...messages, userMsg];
    setMessages(base);
    setSending(true);

    const ctx = ctxState.data;
    if (!ctx) {
      setError(t('common.errorHint'));
      setSending(false);
      return;
    }
    const result = await sendChatMessage(text, ctx, locale);
    setSending(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    if (result.data.notice) setNotice(result.data.notice);
    const reply: ChatMessage = {
      role: 'assistant',
      content: result.data.message,
      ts: new Date().toISOString(),
      pendingActions: result.data.pendingActions,
      source: result.data.source,
      resolved: result.data.pendingActions.length === 0,
    };
    const next = [...base, reply];
    setMessages(next);
    await persist(next);
    ctxState.reload();
  };

  const handleConfirm = async (msgIndex: number, ids: string[]) => {
    const target = messages[msgIndex];
    if (!target?.pendingActions) return;
    const chosen = target.pendingActions.filter((a) => ids.includes(a.id));
    if (chosen.length === 0) return;
    setError(null);
    const categories = categoriesState.data ?? [];
    const result = await confirmPendingActions(chosen, categories);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    setNotice(t('ai.writeSuccess', { n: String(result.data.created) }));
    const next = resolveConfirmedMessages(messages, msgIndex, ids);
    setMessages(next);
    // 关键：把「已确认」状态持久化到会话。若只更新内存，随后任何会话重载都会
    // 从 localStorage 读回未确认的旧消息并覆盖 UI，导致卡片回滚、看起来没反应，
    // 再次点击还会重复写入。persist 同时会清掉该消息的 pending_actions 快照。
    await persist(next);
    // 仅刷新 AI 上下文供后续对话使用；不再 reload 会话，避免用重载数据覆盖已确认状态。
    ctxState.reload();
  };

  const handleIgnore = async (msgIndex: number) => {
    const ids = (messages[msgIndex]?.pendingActions ?? []).map((a) => a.id);
    const next = resolveConfirmedMessages(messages, msgIndex, ids);
    setMessages(next);
    await persist(next);
  };

  const clearChat = async () => {
    const greetingMsg: ChatMessage = {
      role: 'assistant', content: assistantService.greeting(locale), ts: new Date().toISOString(), source: 'local',
    };
    setMessages([greetingMsg]);
    setNotice(null);
    setError(null);
    await persist([greetingMsg]);
  };

  const loading = ctxState.loading || convState.loading || categoriesState.loading;
  const loadError = ctxState.error ?? convState.error;

  return (
    <>
      <PageHeader
        title={t('ai.title')}
        subtitle={t('ai.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="primary">{t('common.phaseTag', { n: 6 })}</Badge>
            <Button variant="secondary" size="sm" onClick={clearChat} title={t('ai.clear')}>
              <Trash2 className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t('ai.clear')}</span>
            </Button>
          </div>
        }
      />

      <Card className="mb-4 flex items-start gap-2.5 border-primary/30 bg-primary/5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="text-xs leading-relaxed text-muted">{t('ai.needsConfirm')}</p>
      </Card>

      <Card className="mx-auto flex h-[calc(100vh-330px)] min-h-[440px] max-w-3xl flex-col p-0">
        {loading ? (
          <div className="flex flex-1 items-center justify-center"><LoadingState /></div>
        ) : loadError ? (
          <div className="flex flex-1 items-center justify-center p-5">
            <ErrorState
              description={errorText(loadError)}
              onRetry={() => { ctxState.reload(); convState.reload(); }}
            />
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center">
                  <EmptyState description={t('ai.empty')} />
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((m, i) => (
                    <MessageBubble
                      key={`${m.ts}-${i}`}
                      message={m}
                      index={i}
                      timezone={timezone}
                      locale={locale}
                      onConfirm={handleConfirm}
                      onIgnore={handleIgnore}
                    />
                  ))}
                  {sending && (
                    <div className="flex gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                        <Bot className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="rounded-2xl bg-black/5 px-4 py-2.5 text-sm text-muted dark:bg-white/5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((p) => {
                  const Icon = p.icon;
                  const text = locale === 'zh-CN' ? p.textZh : p.textEn;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => void send(text)}
                      disabled={sending}
                      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <Icon className="h-3 w-3" aria-hidden /> {t(p.key)}
                    </button>
                  );
                })}
              </div>

              {(notice || error) && (
                <div className={cn('mb-2 flex items-start gap-2 rounded-lg px-3 py-2 text-xs', error ? 'bg-danger/10 text-danger' : 'bg-success/10 text-[#5f8668] dark:text-success')}>
                  {error ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <span>{error ?? notice}</span>
                </div>
              )}

              <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t('ai.placeholder')}
                  className="h-10 flex-1 rounded-xl border bg-card px-3.5 text-sm text-ink placeholder:text-muted/70 focus:outline focus:outline-2 focus:outline-primary/50"
                  style={{ borderColor: 'var(--border)' }}
                  aria-label={t('ai.placeholder')}
                  disabled={sending}
                />
                <Button variant="primary" type="submit" disabled={!input.trim() || sending}>
                  <Send className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">{sending ? t('ai.thinking') : t('ai.send')}</span>
                </Button>
              </form>
            </div>
          </>
        )}
      </Card>

      <p className="mx-auto mt-3 max-w-3xl text-center text-[11px] text-muted">
        {t('ai.localModeHint')}
      </p>
    </>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  index: number;
  timezone: string;
  locale: 'zh-CN' | 'en-US';
  onConfirm: (index: number, ids: string[]) => Promise<void>;
  onIgnore: (index: number) => Promise<void>;
}

function MessageBubble({ message, index, timezone, locale, onConfirm, onIgnore }: MessageBubbleProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const actions = message.pendingActions ?? [];
  const unresolved = actions.length > 0 && !message.resolved;

  useEffect(() => {
    if (actions.length) {
      setSelected(Object.fromEntries(actions.map((a) => [a.id, true])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.ts]);

  const chosen = actions.filter((a) => selected[a.id] !== false).map((a) => a.id);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(index, chosen);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('flex gap-2.5', message.role === 'user' && 'flex-row-reverse')}>
      <span className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
        message.role === 'user' ? 'bg-primary text-white' : 'bg-primary/12 text-primary',
      )}>
        {message.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </span>
      <div className="min-w-0 max-w-[80%] flex-1">
        <div className={cn(
          'whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          message.role === 'user' ? 'bg-primary text-white' : 'bg-black/5 text-ink dark:bg-white/5',
        )}>
          {message.content}
        </div>

        {message.role === 'assistant' && actions.length > 0 && (
          <div className="mt-2 rounded-xl border border-primary/30 bg-card p-3" style={{ borderColor: 'var(--border)' }}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink">{t('ai.pendingTitle')}（{actions.length}）</p>
              <div className="flex gap-2">
                <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setSelected(Object.fromEntries(actions.map((a) => [a.id, true])))}>
                  {t('ai.selectAll')}
                </button>
                <button type="button" className="text-[11px] text-muted hover:underline" onClick={() => setSelected(Object.fromEntries(actions.map((a) => [a.id, false])))}>
                  {t('ai.selectNone')}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {actions.map((action) => {
                const Icon = actionIcon[action.kind];
                const isOn = selected[action.id] !== false;
                return (
                  <label
                    key={action.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5',
                      !unresolved && 'opacity-60',
                    )}
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <input
                      type="checkbox"
                      checked={unresolved && isOn}
                      disabled={!unresolved}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [action.id]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
                        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
                        {describePendingAction(action, timezone, locale)}
                      </span>
                      {action.conflicts.length > 0 && (
                        <span className="mt-1 flex items-center gap-1 text-[11px] text-warning">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          {t('ai.conflictHint')}：{action.conflicts.join('、')}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            {unresolved ? (
              <div className="mt-3 flex gap-2">
                <Button variant="primary" size="sm" disabled={busy || chosen.length === 0} onClick={() => void confirm()}>
                  <Check className="h-3.5 w-3.5" aria-hidden /> {t('ai.confirmWrite')}（{chosen.length}）
                </Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => onIgnore(index)}>
                  <X className="h-3.5 w-3.5" aria-hidden /> {t('ai.ignore')}
                </Button>
              </div>
            ) : (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-muted">
                <Check className="h-3 w-3 text-success" aria-hidden /> {t('ai.resolved')}
              </p>
            )}
          </div>
        )}

        {message.role === 'assistant' && message.source && (
          <p className="mt-1 text-[10px] text-muted">
            {message.source === 'ai' ? t('import.source.ai') : t('import.source.local')}
          </p>
        )}
      </div>
    </div>
  );
}
