import type { Result, AiContext, PlanDraft } from '@/types/api';
import { ok } from '@/types/api';
import type { Category } from '@/types/models';
import type { Locale } from '@/types/enums';
import { aiService } from './index';
import { loadAiContext, confirmPendingActions } from './assistantService';
import { buildPlan, planDay, reschedulePending, type PlanMode } from '@/lib/planningEngine';

/** 规划来源：AI 网关 / 本地规则引擎 */
export type PlanSource = 'ai' | 'local';

export interface PlanResult extends PlanDraft {
  source: PlanSource;
  notice?: string;
}

/**
 * 生成计划：优先 AI 网关，失败或不可用时降级本地规划引擎。
 * 保证「AI 不可用 → 智能规划仍可用」，与 Phase 5/6 同一降级策略。
 */
export async function generatePlan(
  mode: PlanMode,
  ctx: AiContext,
  locale: Locale,
): Promise<Result<PlanResult>> {
  if (aiService.isAvailable()) {
    const aiResult = mode === 'day' ? await aiService.planDay(ctx) : await aiService.reschedule(ctx);
    if (aiResult.ok) {
      return ok({ ...aiResult.data, source: 'ai' });
    }
    // AI 网关失败 → 静默降级本地
    const draft = buildPlan(ctx, mode, locale);
    return ok({ ...draft, source: 'local', notice: 'AI 规划暂时不可用，已切换为本地规划引擎（离线可用）。' });
  }

  const draft = mode === 'day' ? planDay(ctx, locale) : reschedulePending(ctx, locale);
  return ok({ ...draft, source: 'local' });
}

/** 确认写入计划草案：复用 AI 助手的确认闸门（只写勾选项，走同一套活动日志） */
export function confirmPlan(actions: PlanDraft['actions'], categories: Category[]) {
  return confirmPendingActions(actions, categories);
}

export const planningService = {
  generatePlan,
  confirmPlan,
  loadAiContext,
};
