import { describe, it, expect } from 'vitest';
import {
  parseScheduleWeeks,
  parsePeriodRange,
  weekDate,
  parseSchedule,
  DEFAULT_PERIOD_TIMES,
  SCHEDULE_SAMPLE,
} from '@/lib/scheduleParser';
import { formatInZone } from '@/lib/timezone';

const WEEK2_MONDAY = '2026-09-07';
const TZ = 'Asia/Singapore';

describe('scheduleParser.parseScheduleWeeks 周次规则', () => {
  it('解析连续周次 1-18周', () => {
    expect(parseScheduleWeeks('1-18周')).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });

  it('解析固定单周 第6周', () => {
    expect(parseScheduleWeeks('第6周')).toEqual([6]);
  });

  it('解析分段周次 4-6周,8-11周', () => {
    expect(parseScheduleWeeks('4-6周,8-11周')).toEqual([4, 5, 6, 8, 9, 10, 11]);
  });

  it('解析双周 1-18周(双)——只保留偶数周', () => {
    const weeks = parseScheduleWeeks('1-18周(双)');
    expect(weeks).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18]);
  });

  it('解析单周 1-16周(单)——只保留奇数周', () => {
    expect(parseScheduleWeeks('1-16周(单)')).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
  });

  it('解析 9-16周 与「隔周」', () => {
    expect(parseScheduleWeeks('9-16周')).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    expect(parseScheduleWeeks('2-10周 隔周')).toEqual([2, 4, 6, 8, 10]);
  });
});

describe('scheduleParser.parsePeriodRange 节次映射', () => {
  it('解析跨节 3-4节 / 1-12节', () => {
    expect(parsePeriodRange('3-4节')).toEqual({ start: 3, end: 4 });
    expect(parsePeriodRange('1-12节')).toEqual({ start: 1, end: 12 });
    expect(parsePeriodRange('7-10节')).toEqual({ start: 7, end: 10 });
  });

  it('解析单节 2节', () => {
    expect(parsePeriodRange('2节')).toEqual({ start: 2, end: 2 });
  });

  it('作息时间表关键节次时刻正确', () => {
    expect(DEFAULT_PERIOD_TIMES[1]).toEqual({ start: '08:30', end: '09:10' });
    expect(DEFAULT_PERIOD_TIMES[7]).toEqual({ start: '15:40', end: '16:20' });
    expect(DEFAULT_PERIOD_TIMES[8].end).toBe('17:00');
    expect(DEFAULT_PERIOD_TIMES[9].start).toBe('18:20');
    expect(DEFAULT_PERIOD_TIMES[12].end).toBe('21:10');
  });
});

describe('scheduleParser.weekDate 周次锚点日期', () => {
  it('第2周周一 = 锚点 2026-09-07', () => {
    expect(weekDate(2, 1, WEEK2_MONDAY)).toBe('2026-09-07');
  });

  it('第1周周一 = 锚点前一周 2026-08-31', () => {
    expect(weekDate(1, 1, WEEK2_MONDAY)).toBe('2026-08-31');
  });

  it('第7周周五 = 2026-10-16', () => {
    // 09-07 + 5周 = 10-12(周一) + 4 = 10-16(周五)
    expect(weekDate(7, 5, WEEK2_MONDAY)).toBe('2026-10-16');
  });

  it('周日映射到该周最后一天', () => {
    expect(weekDate(2, 0, WEEK2_MONDAY)).toBe('2026-09-13');
  });
});

describe('scheduleParser.parseSchedule 端到端', () => {
  it('示例课表展开为带精确日期的课程事件', () => {
    const candidates = parseSchedule(SCHEDULE_SAMPLE, { week2Monday: WEEK2_MONDAY, timezone: TZ });
    // 双周课 4-18 偶周=8次，3-18=16次，7-14=8次，1-17=17次，2-17=16次，
    // 第7周=1次，分段3-5+8-18=3+11=14次，4-6+8-11=3+4=7次，2-17=16次，2-17=16次
    expect(candidates.length).toBeGreaterThan(80);

    // 所有候选都是 study 类课程事件，无重复规则（已展开）
    expect(candidates.every((c) => c.kind === 'create_event' && c.recurrence === null)).toBe(true);
    expect(candidates.every((c) => c.category_name === 'Study')).toBe(true);
    expect(candidates.every((c) => Boolean(c.start_at && c.end_at && c.title))).toBe(true);
  });

  it('固定单周课程只生成一条候选', () => {
    const line = '周五 5-6节 第7周 视听语言 @学思楼1-C410';
    const candidates = parseSchedule(line, { week2Monday: WEEK2_MONDAY, timezone: TZ });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toContain('第7周');
    expect(candidates[0].location).toBe('学思楼1-C410');
    // 第7周周五 = 2026-10-16，5节 14:00 起
    expect(formatInZone(candidates[0].start_at!, 'yyyy-MM-dd HH:mm', TZ)).toBe('2026-10-16 14:00');
    expect(formatInZone(candidates[0].end_at!, 'HH:mm', TZ)).toBe('15:25');
  });

  it('1-12节整日课程时段为 08:30-21:10', () => {
    const line = '周四 11-12节 2-17周 人工智能导论 @知行楼1-314';
    const candidates = parseSchedule(line, { week2Monday: WEEK2_MONDAY, timezone: TZ });
    expect(candidates.length).toBe(16);
    expect(formatInZone(candidates[0].start_at!, 'HH:mm', TZ)).toBe('19:50');
    expect(formatInZone(candidates[0].end_at!, 'HH:mm', TZ)).toBe('21:10');
  });

  it('按开始时间排序', () => {
    const candidates = parseSchedule(SCHEDULE_SAMPLE, { week2Monday: WEEK2_MONDAY, timezone: TZ });
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].start_at! <= candidates[i].start_at!).toBe(true);
    }
  });
});

describe('scheduleParser 周字重复的范围写法', () => {
  it('「第7周-18周」展开为 7..18 全部周次而非首尾两周', () => {
    expect(parseScheduleWeeks('第7周-18周')).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it('整行解析时标题不残留「-18周」，且按全周次展开', () => {
    const cs = parseSchedule('周五 7-8节 第7周-18周 视听语言 @学思楼1-C410', { week2Monday: WEEK2_MONDAY, timezone: TZ });
    expect(cs).toHaveLength(12);
    expect(cs.every((c) => c.title === '视听语言（第7周）' || /^视听语言（第\d+周）$/.test(c.title))).toBe(true);
    expect(cs.some((c) => c.title.includes('-18周'))).toBe(false);
  });
});
