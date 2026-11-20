import { useCallback } from 'react';
import { errorMessage } from '@/lib/errorMessages';
import { useI18n } from '@/hooks/useI18n';

/** 返回把错误对象转为当前语言用户可读文案的函数 */
export function useErrorText(): (err: unknown) => string {
  const { locale } = useI18n();
  return useCallback((err: unknown) => errorMessage(err, locale), [locale]);
}
