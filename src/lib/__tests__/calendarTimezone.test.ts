import { describe, it, expect } from 'vitest';
import { toEventInput, buildWeekSlots } from '@/components/calendar/CalendarShell';
import { makeEvent } from '@/test/factories';

const SGT = 'Asia/Singapore';

describe('日历事件显示时区（墙上时间投影）', () => {
  it('导入的开课事件 00:30Z 在日历上显示为 08:30（不偏移 8 小时）', () => {
    const event = makeEvent({
      start_at: '2026-11-16T00:30:00.000Z', // 1-2节 08:30 SGT
      end_at: '2026-11-16T01:55:00.000Z',   // 09:55 SGT
    });
    const input = toEventInput(event, SGT);
    expect(input.start).toBe('2026-11-16T08:30:00');
    expect(input.end).toBe('2026-11-16T09:55:00');
  });

  it('晚间 11-12 节 19:50-21:10 正确投影', () => {
    const event = makeEvent({
      start_at: '2026-11-20T11:50:00.000Z',
      end_at: '2026-11-20T13:10:00.000Z',
    });
    const input = toEventInput(event, SGT);
    expect(input.start).toBe('2026-11-20T19:50:00');
    expect(input.end).toBe('2026-11-20T21:10:00');
  });

  it('全天事件保留纯日期，不做时间投影', () => {
    const event = makeEvent({ all_day: true, start_at: '2026-11-16T00:00:00.000Z' });
    const input = toEventInput(event, SGT);
    expect(input.start).toBe('2026-11-16');
  });

  it('取消的事件保持隐藏', () => {
    const event = makeEvent({ is_cancelled: true, occurrence_date: '2026-11-16' });
    const input = toEventInput(event, SGT);
    expect(input.display).toBe('none');
  });
});

describe('周视图紧凑时间行（只显示有课的时间段）', () => {
  const week = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];

  it('只返回有日程的时刻，按 24 小时升序，空档时间不占位', () => {
    const events = [
      makeEvent({ start_at: '2026-11-16T11:50:00.000Z' }), // 19:50 SGT（晚课）
      makeEvent({ start_at: '2026-11-17T00:30:00.000Z' }), // 08:30 SGT（早课）
    ];
    const { slots } = buildWeekSlots(events, week, SGT);
    expect(slots).toEqual(['08:30', '19:50']);
  });

  it('忽略本周之外与已取消的事件', () => {
    const events = [
      makeEvent({ start_at: '2026-12-01T00:30:00.000Z' }), // 其他周
      makeEvent({ start_at: '2026-11-17T00:30:00.000Z', is_cancelled: true }),
      makeEvent({ start_at: '2026-11-18T02:10:00.000Z' }), // 10:10 SGT 有效
    ];
    const { slots, slotEvents } = buildWeekSlots(events, week, SGT);
    expect(slots).toEqual(['10:10']);
    expect(slotEvents.get('10:10')).toHaveLength(1);
  });
});
