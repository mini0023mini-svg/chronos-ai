import type { IAIService } from '../interfaces';
import type { Result } from '@/types/api';
import { fail } from '@/types/api';
import { Errors } from '@/lib/errors';
import type { PendingAction } from '@/types/models';

/** Phase 1 AI 占位：始终返回不可用，UI 走手动降级路径；Phase 5+ 替换实现 */
export const mockAiService: IAIService = {
  isAvailable() {
    return false;
  },
  async chat() {
    return fail(Errors.aiUnavailable('AI opens in Phase 6'));
  },
  async importParse(): Promise<Result<PendingAction[]>> {
    return fail(Errors.aiUnavailable('AI opens in Phase 5'));
  },
  async planDay() {
    return fail(Errors.aiUnavailable('AI opens in Phase 7'));
  },
  async reschedule() {
    return fail(Errors.aiUnavailable('AI opens in Phase 7'));
  },
  async confirm() {
    return fail(Errors.aiUnavailable('AI opens in Phase 5+'));
  },
};
