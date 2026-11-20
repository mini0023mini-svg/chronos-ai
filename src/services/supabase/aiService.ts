import type { IAIService } from '../interfaces';
import type { Result } from '@/types/api';
import { fail } from '@/types/api';
import { Errors } from '@/lib/errors';
import type { PendingAction } from '@/types/models';

/**
 * AI 服务端代理（Phase 5+ 启用）：
 * 前端只调用 VITE_AI_GATEWAY_URL（Edge Function / Vercel Serverless），
 * GEMINI_API_KEY 仅存在于服务端环境变量，绝不进入前端。
 * Phase 2 阶段网关尚未部署，统一返回 unavailable，UI 走手动降级路径。
 */
async function callGateway<T>(_path: string, _body: unknown): Promise<Result<T>> {
  return fail(Errors.aiUnavailable('AI gateway opens in Phase 5+'));
}

export const supabaseAiService: IAIService = {
  isAvailable() {
    return false;
  },
  async chat() {
    return callGateway('/chat', {});
  },
  async importParse(): Promise<Result<PendingAction[]>> {
    return callGateway('/import', {});
  },
  async planDay() {
    return callGateway('/plan', {});
  },
  async reschedule() {
    return callGateway('/reschedule', {});
  },
  async confirm() {
    return callGateway('/confirm', {});
  },
};
