/**
 * 错误码 → 用户可读文案映射。
 * 服务层的 AppError.message 多为英文技术信息（如 "Network error"），不应直接展示给终端用户。
 * 这里统一按 code 映射到 i18n key；特殊业务错误（如 CHECK_EMAIL）单独识别。
 */
import { AppError } from '@/lib/errors';
import type { I18nKey } from '@/i18n';
import { translate } from '@/i18n';
import type { Locale } from '@/types/enums';

const BY_CODE: Record<AppError['code'], I18nKey> = {
  UNKNOWN: 'error.unknown',
  NETWORK: 'error.network',
  NOT_FOUND: 'error.notFound',
  VALIDATION: 'error.validation',
  AUTH: 'error.auth',
  AI_UNAVAILABLE: 'error.aiUnavailable',
  AI_RATE_LIMITED: 'error.aiRateLimited',
  CONFLICT: 'error.conflict',
  PERMISSION: 'error.permission',
};

/** 把任意错误转为 i18n key；保留特定业务标记，其余按错误码映射 */
export function errorToI18nKey(err: unknown): I18nKey {
  if (err instanceof AppError) {
    if (err.code === 'AUTH' && err.message === 'CHECK_EMAIL') return 'login.checkEmail';
    return BY_CODE[err.code] ?? 'error.unknown';
  }
  return 'error.unknown';
}

/** 把任意错误转为指定语言的用户可读文案 */
export function errorMessage(err: unknown, locale: Locale): string {
  return translate(locale, errorToI18nKey(err));
}
