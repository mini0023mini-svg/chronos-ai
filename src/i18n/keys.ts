import type { Locale } from '@/types/enums';
import type { I18nKey } from './locales/zh-CN';
import { zhCN } from './locales/zh-CN';
import { enUS } from './locales/en-US';

export type { I18nKey };

/** 所有语言包 */
export const dictionaries: Record<Locale, Record<I18nKey, string>> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

/** 插值：把 "{n}" 占位符替换为变量值 */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

/** 纯函数翻译：给定语言与 key，返回文案 */
export function translate(locale: Locale, key: I18nKey, vars?: Record<string, string | number>): string {
  const dict = dictionaries[locale] ?? dictionaries['zh-CN'];
  return interpolate(dict[key] ?? key, vars);
}
