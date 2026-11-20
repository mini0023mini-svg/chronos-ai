/**
 * 课程表专用解析器 —— 把「星期 + 节次 + 周次」的结构化课程表文本，
 * 按开学周锚点展开成带精确日期的具体课程事件候选。
 *
 * 为什么展开成独立事件而不是 weekly 重复规则：
 *   通用 RecurrenceSpec 只能表达「连续每周/隔周」，无法表达「第6周」
 *   「1-18周(双)」「4-6周,8-11周」这类真实课表周次。展开后每个周次
 *   都是独立事件，既精确又可单独编辑/取消，且完全复用导入确认闸门。
 *
 * 设计约束：纯本地、无网络、无密钥；与 importParser 的 ImportCandidate 对齐。
 */
import { addDays, parseISO } from 'date-fns';
import type { ImportCandidate } from './importParser';
import { fromZoneTime } from './timezone';
import { makeId } from './utils';

/** 单节起止时刻（来自用户学校《作息时间表》图片；合并节由起止节自动覆盖） */
export interface PeriodSlot {
  start: string; // HH:mm
  end: string; // HH:mm
}

/** 节次 → 时刻，key 为节次数字（1–12）。7-8 / 9-10 / 11-12 各拆为两节，合并段由首末节覆盖。 */
export const DEFAULT_PERIOD_TIMES: Record<number, PeriodSlot> = {
  1: { start: '08:30', end: '09:10' },
  2: { start: '09:15', end: '09:55' },
  3: { start: '10:10', end: '10:50' },
  4: { start: '10:55', end: '11:35' },
  5: { start: '14:00', end: '14:40' },
  6: { start: '14:45', end: '15:25' },
  7: { start: '15:40', end: '16:20' },
  8: { start: '16:20', end: '17:00' },
  9: { start: '18:20', end: '19:00' },
  10: { start: '19:00', end: '19:40' },
  11: { start: '19:50', end: '20:30' },
  12: { start: '20:30', end: '21:10' },
};

export interface ScheduleParseOptions {
  /** 第2周周一的日期（yyyy-MM-dd），周次锚点 */
  week2Monday: string;
  /** IANA 时区，如 Asia/Singapore */
  timezone: string;
  /** 作息时间表（可覆盖默认） */
  periodTimes?: Record<number, PeriodSlot>;
}

const DOW_MAP: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0,
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 0,
};

/** 归一化「第7周-18周」「7周至18周」这类周字重复的范围写法为 7-18周 */
function normalizeWeekRange(line: string): string {
  return line.replace(/第?\s*(\d+)\s*周\s*[-~–—至到]\s*(\d+)\s*周/g, '$1-$2周');
}

/** 解析周次表达式为具体周次数组。
 *  支持：1-18周 / 9-16周 / 第6周 / 4-6周,8-11周 / 1-18周(双) / 第7周-18周 / 单周 / 隔周 */
export function parseScheduleWeeks(expr: string): number[] {
  if (!expr || !expr.trim()) return [];
  expr = normalizeWeekRange(expr);
  const parity: 'even' | 'odd' | null =
    /[（(]双[）)]|双周|隔周/.test(expr) ? 'even'
      : /[（(]单[）)]|单周/.test(expr) ? 'odd'
        : null;

  const out = new Set<number>();
  // 分段：中文/英文逗号、顿号、分号
  const segments = expr.split(/[,，、;；]/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    let hit = false;
    // 第N周
    for (const m of seg.matchAll(/第\s*(\d+)\s*周/g)) {
      const w = Number(m[1]);
      if (w > 0 && w <= 60) { out.add(w); hit = true; }
    }
    // a-b周
    for (const m of seg.matchAll(/(\d+)\s*[-~–—至到]\s*(\d+)\s*周?/g)) {
      const a = Number(m[1]); const b = Number(m[2]);
      if (a > 0 && b >= a && b <= 60) {
        for (let w = a; w <= b; w++) { out.add(w); hit = true; }
      }
    }
    // 裸「N周」（单周）
    if (!hit) {
      for (const m of seg.matchAll(/(\d+)\s*周/g)) {
        const w = Number(m[1]);
        if (w > 0 && w <= 60) { out.add(w); hit = true; }
      }
    }
  }

  let weeks = [...out].sort((a, b) => a - b);
  if (parity === 'even') weeks = weeks.filter((w) => w % 2 === 0);
  if (parity === 'odd') weeks = weeks.filter((w) => w % 2 === 1);
  return weeks;
}

/** 解析节次表达式，返回 {start,end} 节号。支持 3-4节 / 1-12节 / 单节 2 */
export function parsePeriodRange(expr: string): { start: number; end: number } | null {
  const range = expr.match(/(\d+)\s*[-~–—至到]\s*(\d+)\s*节?/);
  if (range) {
    const a = Number(range[1]); const b = Number(range[2]);
    if (a > 0 && b >= a) return { start: a, end: b };
  }
  const single = expr.match(/(\d+)\s*节/);
  if (single) {
    const n = Number(single[1]);
    if (n > 0) return { start: n, end: n };
  }
  return null;
}

/** 计算第 week 周、星期 dow（0=周日）的本地日期 yyyy-MM-dd。锚点：第2周周一 = week2Monday。 */
export function weekDate(week: number, dow: number, week2Monday: string): string {
  const monday2 = parseISO(week2Monday);
  const monday = addDays(monday2, (week - 2) * 7);
  const offset = dow === 0 ? 6 : dow - 1;
  return formatDate(addDays(monday, offset));
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function extractWeekExpr(line: string): string {
  const parts: string[] = [];
  // 先归一化「第7周-18周」这类周字重复的范围写法，否则正则只会匹配到「第7周」，
  // 把「18周」单独拆出来（导致只取到首尾两周）。
  const norm = normalizeWeekRange(line);
  // a-b周 / 第N周 / N周（含可选 (双)/(单) 后缀）
  const re = /(?:第\s*)?\d+(?:\s*[-~–—至到]\s*\d+)?\s*周(?:\s*[（(][双单][）)])?/g;
  for (const m of norm.matchAll(re)) parts.push(m[0]);
  // 独立的「双周/单周/隔周」修饰
  if (/双周|隔周|[（(]双[）)]/.test(norm) && !parts.some((p) => /[（(]双[）)]|双周/.test(p))) parts.push('双周');
  if (/单周|[（(]单[）)]/.test(norm) && !parts.some((p) => /[（(]单[）)]|单周/.test(p))) parts.push('单周');
  return parts.join(',');
}

function extractDow(line: string): number | null {
  const m = line.match(/(?:星期|周|礼拜)\s*([一二三四五六日天1-7])/);
  if (m) return DOW_MAP[m[1]] ?? null;
  return null;
}

function extractLocation(line: string): string | null {
  const at = line.match(/[@＠]\s*([^\s,，;；]+)/);
  if (at) return at[1].trim();
  const field = line.match(/场地[:：]\s*([^\s,，;；/]+)/);
  return field ? field[1].trim() : null;
}

/** 从一行课程文本中剔除已识别的结构化片段，清理出课程名（保留课程名中的连接号） */
function extractTitle(line: string, tokens: string[]): string {
  let work = line;
  for (const tk of tokens) work = work.split(tk).join(' ');
  return work
    .replace(/[（(]\s*\d+\s*[-~–—至到]\s*\d+\s*节\s*[）)]/g, ' ')
    .replace(/第?\s*\d+\s*周\s*[-~–—至到]\s*\d+\s*周/g, ' ') // 第7周-18周（周字重复的范围）
    .replace(/第\s*\d+\s*周/g, ' ')
    .replace(/(?:星期|周|礼拜)\s*[一二三四五六日天1-7]/g, ' ')
    .replace(/[@＠]\s*[^\s,，;；]+/g, ' ')
    .replace(/场地[:：]\s*[^\s,，;；/]+/g, ' ')
    .replace(/教师[:：]\s*[^\s,，;；]+/g, ' ')
    .replace(/教学班[:：]\s*[^\s,，;；]+/g, ' ')
    .replace(/考核方式[:：]\s*[^\s,，;；]+/g, ' ')
    .replace(/[@＠]/g, ' ')
    .replace(/[,，。;；:：、()（）[\]*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 把作息时间表对象序列化为可编辑文本（每行「节次 起-止」） */
export function periodTimesToText(times: Record<number, PeriodSlot>): string {
  return Object.keys(times)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => `${n} ${times[n].start}-${times[n].end}`)
    .join('\n');
}

/** 解析用户编辑的作息时间表文本为节次表；无效行忽略，全部无效时返回 null */
export function parsePeriodTimes(text: string): Record<number, PeriodSlot> | null {
  const out: Record<number, PeriodSlot> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/(\d+)\s+(\d{1,2}:\d{2})\s*[-~–—至到]\s*(\d{1,2}:\d{2})/);
    if (!m) continue;
    const n = Number(m[1]);
    if (n < 1 || n > 30) continue;
    out[n] = { start: m[2], end: m[3] };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** 从用户课表图片逐格提取的真实结构化课表（第1/2页 + 晚间跨页），可直接导入 */
export const SCHEDULE_SAMPLE = `周一 3-4节 1-18周 思政课-德法 @学思楼1-A403
周一 5-6节 4-6周,8-11周 职业生涯与发展规划 @学思楼2-C410
周一 7-8节 第7周 形势与政策 @学思楼1-A403
周一 9-10节 第7周 职业生涯与发展规划 @学思楼1-C410
周二 1-2节 1-18周(双) 思政课-德法 @学思楼1-A403
周二 3-4节 7-14周 劳动教育 @学思楼3-C502
周二 5-6节 2-17周 大学语文 @学思楼3-C503
周二 7-8节 1-17周 体育-排球 @综合馆篮球场
周二 11-12节 2-17周 职业生涯与发展规划 @学思楼2-C410
周三 1-2节 2-17周 摄影摄像基础 @摄影摄像实验室1-B501
周三 9-10节 2-17周 视听语言 @学思楼1-C410
周三 11-12节 2-17周 视听语言 @学思楼1-C410
周四 3-4节 1-18周 思政课-德法 @学思楼1-B401
周四 5-6节 2-17周 大学英语 @学思楼1-C501
周四 7-10节 1-17周 画面设计基础 @学思楼1-C501
周五 1-2节 1-17周 大学英语 @学思楼1-C502
周五 5-6节 第6周,第7周 视听语言 @学思楼1-C410
周五 7-8节 第7周-18周 视听语言 @学思楼1-C410
周五 7-8节 第7周 形势与政策 @学思楼1-A403
周五 11-12节 2-17周 人工智能导论 @学思楼1-314`;

/**
 * 把结构化课程表文本解析为候选事件（每门课 × 每个周次 = 一条候选）。
 */
export function parseSchedule(text: string, opts: ScheduleParseOptions): ImportCandidate[] {
  const times = opts.periodTimes ?? DEFAULT_PERIOD_TIMES;
  const out: ImportCandidate[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.length < 4) continue;

    const weekExpr = extractWeekExpr(line);
    const weeks = parseScheduleWeeks(weekExpr);
    if (weeks.length === 0) continue;

    const dow = extractDow(line);
    if (dow === null) continue;

    const periodExpr = line.match(/(?:\(?\s*)?\d+\s*(?:[-~–—至到]\s*\d+)?\s*节\s*\)?/)?.[0] ?? '';
    const period = parsePeriodRange(periodExpr);
    if (!period) continue;

    const startSlot = times[period.start];
    const endSlot = times[period.end];
    if (!startSlot || !endSlot) continue;

    const location = extractLocation(line);
    const title = extractTitle(line, [weekExpr, periodExpr, ...(location ? [location] : [])]);
    if (!title) continue;

    for (const week of weeks) {
      const date = weekDate(week, dow, opts.week2Monday);
      const startAt = fromZoneTime(`${date}T${startSlot.start}:00`, opts.timezone).toISOString();
      const endAt = fromZoneTime(`${date}T${endSlot.end}:00`, opts.timezone).toISOString();
      out.push({
        id: makeId(),
        kind: 'create_event',
        title: `${title}（第${week}周）`,
        start_at: startAt,
        end_at: endAt,
        all_day: false,
        location,
        recurrence: null,
        category_name: 'Study',
        confidence: 0.93,
        needsConfirm: false,
        flags: {},
        conflicts: [],
        source: `${date} 第${week}周 ${period.start === period.end ? period.start : `${period.start}-${period.end}`}节 · ${rawLine.trim()}`,
      });
    }
  }

  // 按日期、开始时间排序，便于预览
  out.sort((a, b) => (a.start_at ?? '').localeCompare(b.start_at ?? ''));
  return out;
}
