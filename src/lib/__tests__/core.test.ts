import { describe, it, expect } from 'vitest';
import { DEFAULT_TIMEZONE, formatInZone, fromZoneTime, toZoneDate, isValidTimeZone } from '@/lib/timezone';
import { generateOccurrences, detectConflicts, scopeEventIds, recurrenceLabel } from '@/lib/recurrence';
import { resolveDeadlineStatus, deadlineColor } from '@/lib/deadline';
import { AppError, Errors } from '@/lib/errors';
import { errorToI18nKey, errorMessage } from '@/lib/errorMessages';
import { makeDeadline, makeEvent } from '@/test/factories';

describe('timezone', () => {
  it('默认时区为 Asia/Singapore', () => {
    expect(DEFAULT_TIMEZONE).toBe('Asia/Singapore');
  });

  it('formatInZone 把 UTC 转为目标时区墙上时间', () => {
    // 2026-11-18T02:00:00Z = 新加坡 10:00
    expect(formatInZone('2026-11-18T02:00:00.000Z', 'yyyy-MM-dd HH:mm', 'Asia/Singapore')).toBe('2026-11-18 10:00');
  });

  it('fromZoneTime 把本地墙上时间转回 UTC', () => {
    const d = fromZoneTime('2026-11-18T10:00:00', 'Asia/Singapore');
    expect(d.toISOString()).toBe('2026-11-18T02:00:00.000Z');
  });

  it('toZoneDate 仅用于展示层计算', () => {
    const d = toZoneDate('2026-11-18T02:00:00.000Z', 'Asia/Singapore');
    expect(d.getHours()).toBe(10);
  });

  it('isValidTimeZone 校验合法/非法时区', () => {
    expect(isValidTimeZone('Asia/Singapore')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });
});

describe('recurrence', () => {
  it('每周重复生成正确数量的实例（含 end_date 截断）', () => {
    const first = { start_at: '2026-11-18T01:00:00.000Z', end_at: '2026-11-18T02:00:00.000Z' };
    const weekly = generateOccurrences(first, { freq: 'weekly', interval: 1, end_date: '2026-12-02', count: null }, 8);
    expect(weekly.map((o) => o.occurrence_date)).toEqual([
      '2026-11-25',
      '2026-12-02',
    ]);
    expect(weekly[0].start_at).toBe('2026-11-25T01:00:00.000Z');
  });

  it('count 限制生成数量', () => {
    const first = { start_at: '2026-11-18T01:00:00.000Z', end_at: '2026-11-18T02:00:00.000Z' };
    const daily = generateOccurrences(first, { freq: 'daily', interval: 1, end_date: null, count: 3 }, 8);
    expect(daily).toHaveLength(2); // count=3 含首个事件，故只生成 2 个后续
  });

  it('scopeEventIds 按 this/following/all 返回正确范围', () => {
    const target = makeEvent({ id: 'e2', recurrence_rule_id: 'r1', occurrence_date: '2026-11-25' });
    const all = [
      makeEvent({ id: 'e1', recurrence_rule_id: 'r1', occurrence_date: '2026-11-18' }),
      target,
      makeEvent({ id: 'e3', recurrence_rule_id: 'r1', occurrence_date: '2026-12-02' }),
      makeEvent({ id: 'other', recurrence_rule_id: 'r2', occurrence_date: '2026-11-25' }),
    ];
    expect(scopeEventIds(target, all, 'this')).toEqual(['e2']);
    expect(scopeEventIds(target, all, 'following')).toEqual(['e2', 'e3']);
    expect(scopeEventIds(target, all, 'all')).toEqual(['e1', 'e2', 'e3']);
  });

  it('detectConflicts 检出重叠且跳过已取消/排除项', () => {
    const candidate = { id: 'new', start_at: '2026-11-19T01:30:00.000Z', end_at: '2026-11-19T02:30:00.000Z', all_day: false };
    const all = [
      makeEvent({ id: 'overlap', start_at: '2026-11-19T01:00:00.000Z', end_at: '2026-11-19T02:00:00.000Z' }),
      makeEvent({ id: 'cancelled', start_at: '2026-11-19T01:30:00.000Z', end_at: '2026-11-19T02:00:00.000Z', is_cancelled: true }),
      makeEvent({ id: 'apart', start_at: '2026-11-19T05:00:00.000Z', end_at: '2026-11-19T06:00:00.000Z' }),
    ];
    expect(detectConflicts(candidate, all).map((e) => e.id)).toEqual(['overlap']);
    expect(detectConflicts(candidate, all, ['overlap'])).toHaveLength(0);
  });

  it('recurrenceLabel 输出短标签', () => {
    expect(recurrenceLabel({ freq: 'weekly', interval: 1 })).toContain('week');
    expect(recurrenceLabel({ freq: 'daily', interval: 2 })).toContain('2');
  });
});

describe('deadline', () => {
  const now = new Date('2026-11-18T00:00:00.000Z').getTime();

  it('finished 状态始终优先', () => {
    expect(resolveDeadlineStatus(makeDeadline({ status: 'finished', due_at: '2020-01-01T00:00:00.000Z' }), now)).toBe('finished');
  });

  it('过期返回 overdue', () => {
    expect(resolveDeadlineStatus(makeDeadline({ due_at: '2026-11-17T00:00:00.000Z' }), now)).toBe('overdue');
  });

  it('3 天内返回 soon，更远返回 not_started/normal', () => {
    expect(resolveDeadlineStatus(makeDeadline({ due_at: '2026-11-19T00:00:00.000Z' }), now)).toBe('soon');
    expect(resolveDeadlineStatus(makeDeadline({ status: 'not_started', due_at: '2026-11-30T00:00:00.000Z' }), now)).toBe('not_started');
    expect(resolveDeadlineStatus(makeDeadline({ status: 'normal', due_at: '2026-11-30T00:00:00.000Z' }), now)).toBe('normal');
  });

  it('deadlineColor 对非法状态回退到 finished 色', () => {
    expect(deadlineColor('overdue')).toBeTruthy();
    expect(deadlineColor('bogus' as never)).toBe(deadlineColor('finished'));
  });
});

describe('errors', () => {
  it('AppError.unknown 保留 AppError，包装普通 Error', () => {
    const original = Errors.network();
    expect(AppError.unknown(original)).toBe(original);
    const wrapped = AppError.unknown(new Error('boom'));
    expect(wrapped.code).toBe('UNKNOWN');
    expect(wrapped.message).toBe('boom');
  });

  it('便捷构造函数设置正确错误码', () => {
    expect(Errors.notFound().code).toBe('NOT_FOUND');
    expect(Errors.aiUnavailable().code).toBe('AI_UNAVAILABLE');
    expect(Errors.conflict().code).toBe('CONFLICT');
  });
});

describe('errorMessages', () => {
  it('每个错误码映射到对应 i18n key', () => {
    expect(errorToI18nKey(Errors.network())).toBe('error.network');
    expect(errorToI18nKey(Errors.notFound())).toBe('error.notFound');
    expect(errorToI18nKey(Errors.auth())).toBe('error.auth');
    expect(errorToI18nKey(Errors.aiRateLimited())).toBe('error.aiRateLimited');
    expect(errorToI18nKey(Errors.permission())).toBe('error.permission');
  });

  it('CHECK_EMAIL 特殊业务错误映射到登录提示', () => {
    expect(errorToI18nKey(new AppError('AUTH', 'CHECK_EMAIL'))).toBe('login.checkEmail');
  });

  it('非 AppError 回退到通用错误', () => {
    expect(errorToI18nKey(new Error('boom'))).toBe('error.unknown');
    expect(errorToI18nKey('string error')).toBe('error.unknown');
  });

  it('errorMessage 返回本地化文案（中英不同）', () => {
    const zh = errorMessage(Errors.network(), 'zh-CN');
    const en = errorMessage(Errors.network(), 'en-US');
    expect(zh).toContain('网络');
    expect(en).toContain('Network');
    expect(zh).not.toBe(en);
  });
});
