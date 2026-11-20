import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

export const DEFAULT_TIMEZONE = 'Asia/Singapore';

/** 常见时区选项（Settings 使用） */
export const TIMEZONE_OPTIONS = [
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Kuala_Lumpur',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
] as const;

/** 按指定时区格式化时间 */
export function formatInZone(date: string | Date, pattern: string, timeZone: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(d, timeZone, pattern);
}

/** 把某时区的本地时间转换为 UTC Date（用于写入 timestamptz） */
export function fromZoneTime(localIso: string, timeZone: string): Date {
  return fromZonedTime(localIso, timeZone);
}

/** 把 UTC 时间转换为指定时区的 Date 对象（仅用于展示层计算） */
export function toZoneDate(utc: string | Date, timeZone: string): Date {
  const d = typeof utc === 'string' ? new Date(utc) : utc;
  return toZonedTime(d, timeZone);
}

/** 判断一个时区字符串是否受浏览器 Intl 支持 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}
