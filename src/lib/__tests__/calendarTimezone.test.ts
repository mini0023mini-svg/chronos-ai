import { describe, it, expect } from 'vitest';
import { toEventInput } from '@/components/calendar/CalendarShell';
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
