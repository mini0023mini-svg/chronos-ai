/** 统一错误码 */
export type ErrorCode =
  | 'UNKNOWN'
  | 'NETWORK'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'AUTH'
  | 'AI_UNAVAILABLE'
  | 'AI_RATE_LIMITED'
  | 'CONFLICT'
  | 'PERMISSION';

/** 应用统一错误对象：服务层只返回它，UI 层按 code 做 i18n 映射 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly detail?: unknown;

  constructor(code: ErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
  }

  static unknown(err: unknown): AppError {
    if (err instanceof AppError) return err;
    const message = err instanceof Error ? err.message : String(err);
    return new AppError('UNKNOWN', message, err);
  }
}

/** 便捷构造函数 */
export const Errors = {
  network: (detail?: unknown) => new AppError('NETWORK', 'Network error', detail),
  notFound: (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found`),
  validation: (message: string) => new AppError('VALIDATION', message),
  auth: (message = 'Authentication required') => new AppError('AUTH', message),
  aiUnavailable: (detail?: unknown) => new AppError('AI_UNAVAILABLE', 'AI service unavailable', detail),
  aiRateLimited: () => new AppError('AI_RATE_LIMITED', 'AI rate limit reached'),
  conflict: (message = 'Time conflict detected') => new AppError('CONFLICT', message),
  permission: (message = 'Permission denied') => new AppError('PERMISSION', message),
};
