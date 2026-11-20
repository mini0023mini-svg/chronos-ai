import type { Result, AiContext, AiReply } from '@/types/api';
import { ok, fail } from '@/types/api';
import type { PendingAction, Category, ActivityLog } from '@/types/models';
import type { Locale } from '@/types/enums';
import { Errors } from '@/lib/errors';
import { makeId } from '@/lib/utils';
import { aiService, dataService } from './index';
import { calendarService } from './calendarService';
import { runLocalAssistant, assistantIntro } from '@/lib/assistantEngine';

/** 聊天来源：AI 网关 / 本地规则引擎 */
export type ChatSource = 'ai' | 'local';

export interface ChatResult extends AiReply {
  source: ChatSource;
  notice?: string;
}

/**
 * 发送消息：优先 AI 网关，失败或不可用时降级本地规则引擎。
 * 保证「AI 不可用 → 聊天管理仍可用」，与 Phase 5 导入同一降级策略。
 */
export async function sendChatMessage(
  message: string,
  ctx: AiContext,
  locale: Locale,
): Promise<Result<ChatResult>> {
  if (!message.trim()) return fail(Errors.validation('消息不能为空'));

  if (aiService.isAvailable()) {
    const aiResult = await aiService.chat(message, ctx);
    if (aiResult.ok) {
      return ok({ ...aiResult.data, source: 'ai' });
    }
    // AI 网关失败 → 静默降级本地，返回提示
    const local = runLocalAssistant(message, ctx, locale);
    return ok({ ...local, source: 'local', notice: 'AI 服务暂时不可用，已切换为本地助手（离线可用）。' });
  }

  return ok({ ...runLocalAssistant(message, ctx, locale), source: 'local' });
}

/** 返回无消息时的引导语（本地即可） */
export function greeting(locale: Locale): string {
  return assistantIntro(locale);
}

/** 分类名 → category_id */
function resolveCategory(name: unknown, categories: Category[]): string | null {
  if (typeof name !== 'string') return null;
  return categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? null;
}

/** 写一条 AI 操作日志（失败不影响主流程） */
async function logAction(kind: PendingAction['kind'], description: string): Promise<void> {
  await dataService.activityLogs.create?.({
    module: 'ai_assistant',
    action: 'confirm',
    target_type: kind,
    target_id: null,
    detail: { description, source: 'assistant' },
  } as Partial<ActivityLog>);
}

/**
 * 确认闸门：只写入用户明确勾选的 PendingAction。
 * - create_event 走 calendarService（重复规则会物化实例）
 * - create_task / create_deadline 走 dataService
 * - update_* 目前未由本地引擎产出，保留分支供 AI 网关扩展
 * 每条成功写入后写日志；返回成功条数与跳过的动作 id（供 UI 幂等清理）。
 */
export async function confirmPendingActions(
  actions: PendingAction[],
  categories: Category[],
): Promise<Result<{ created: number; skipped: string[] }>> {
  if (actions.length === 0) return fail(Errors.validation('没有待确认的操作'));

  let created = 0;
  const skipped: string[] = [];

  for (const action of actions) {
    const p = action.payload;
    if (action.kind === 'create_event') {
      if (typeof p.start_at !== 'string' || typeof p.title !== 'string') {
        skipped.push(action.id);
        continue;
      }
      const result = await calendarService.createEvent({
        title: p.title,
        description: typeof p.description === 'string' ? p.description : null,
        location: typeof p.location === 'string' ? p.location : null,
        start_at: p.start_at,
        end_at: typeof p.end_at === 'string' ? p.end_at : p.start_at,
        all_day: p.all_day === true,
        category_id: resolveCategory(p.category_name, categories),
        timezone: typeof p.timezone === 'string' ? p.timezone : 'Asia/Singapore',
        recurrence: (p.recurrence ?? null) as Parameters<typeof calendarService.createEvent>[0]['recurrence'],
      });
      if (!result.ok) return fail(result.error);
    } else if (action.kind === 'create_task') {
      if (typeof p.title !== 'string') {
        skipped.push(action.id);
        continue;
      }
      const result = await dataService.tasks.create({
        title: p.title,
        notes: typeof p.notes === 'string' ? p.notes : null,
        category_id: resolveCategory(p.category_name, categories),
        priority: (p.priority as 'low' | 'medium' | 'high' | 'urgent') ?? 'medium',
        estimated_minutes: typeof p.estimated_minutes === 'number' ? p.estimated_minutes : null,
        due_at: typeof p.due_at === 'string' ? p.due_at : null,
        remind_at: null,
        is_completed: false,
        completed_at: null,
        parent_task_id: null,
        event_id: null,
        timezone: typeof p.timezone === 'string' ? p.timezone : 'Asia/Singapore',
      });
      if (!result.ok) return fail(result.error);
    } else if (action.kind === 'create_deadline') {
      if (typeof p.title !== 'string' || typeof p.due_at !== 'string') {
        skipped.push(action.id);
        continue;
      }
      const result = await dataService.deadlines.create({
        title: p.title,
        description: typeof p.description === 'string' ? p.description : null,
        due_at: p.due_at,
        status: 'not_started',
        custom_reminder_at: null,
        category_id: null,
        related_task_id: null,
        related_event_id: null,
        timezone: typeof p.timezone === 'string' ? p.timezone : 'Asia/Singapore',
      });
      if (!result.ok) return fail(result.error);
    } else {
      // update_* 由 AI 网关扩展；本地引擎不产出，跳过并让 UI 清理
      skipped.push(action.id);
      continue;
    }

    await logAction(action.kind, action.description);
    created += 1;
  }

  return ok({ created, skipped });
}

/** 生成待确认操作的唯一批次 id（UI 分组用） */
export function newBatchId(): string {
  return `batch-${makeId()}`;
}

/** 构建 AI 上下文所需的数据加载器（页面用 useAsync 组合） */
export async function loadAiContext(timezone: string, date: string): Promise<Result<AiContext>> {
  const [events, tasks, deadlines] = await Promise.all([
    dataService.events.list(),
    dataService.tasks.list(),
    dataService.deadlines.list(),
  ]);
  if (!events.ok) return fail(events.error);
  if (!tasks.ok) return fail(tasks.error);
  if (!deadlines.ok) return fail(deadlines.error);
  return ok({
    timezone,
    date,
    events: events.data,
    tasks: tasks.data,
    deadlines: deadlines.data,
  });
}

export const assistantService = {
  sendChatMessage,
  confirmPendingActions,
  greeting,
  loadAiContext,
  newBatchId,
};
