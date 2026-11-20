import { addDays, format } from 'date-fns';
import type { RecurrenceSpec } from './recurrence';
import { formatInZone, fromZoneTime } from './timezone';
import { makeId } from './utils';

/** 导入候选项：解析后、确认写入前的中间结构（UI 直接消费） */
export interface ImportCandidate {
  id: string;
  kind: 'create_event' | 'create_task' | 'create_deadline';
  title: string;
  /** 事件起止（UTC ISO） */
  start_at?: string;
  end_at?: string;
  all_day?: boolean;
  location?: string | null;
  /** 任务 / 截止日期的到期时间（UTC ISO） */
  due_at?: string;
  /** 重复规则（仅事件） */
  recurrence: RecurrenceSpec | null;
  /** 推断的分类名（写入时映射为 category_id） */
  category_name?: string;
  confidence: number;
  needsConfirm: boolean;
  flags: { conflict?: boolean; missingDate?: boolean; duplicate?: boolean };
  conflicts: string[];
  /** 原始文本行，便于用户对照 */
  source: string;
}

const WEEKDAYS: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0,
  周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6, 周日: 0, 周天: 0,
  星期一: 1, 星期二: 2, 星期三: 3, 星期四: 4, 星期五: 5, 星期六: 6, 星期日: 0, 星期天: 0,
  monday: 1, mon: 1, tuesday: 2, tue: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6, sunday: 0, sun: 0,
};

const DEADLINE_WORDS = /截止|deadline|ddl|due\s*date|到期|提交|交作业|应交/i;
const TITLE_NOISE = /^(课程表|课表|时间表|schedule|timetable|周计划|待办|tasks?|to\s*do|deadlines?|截止日期)\s*[:：]?/i;

function inferCategory(line: string): string {
  if (/数学|物理|化学|英语|语文|生物|历史|课|lecture|class|实验|lab|tutorial|复习|exam|考试/i.test(line)) return 'Study';
  if (/会议|meeting|工作|work|报告|report|项目|project|standup|汇报/i.test(line)) return 'Work';
  if (/健身|跑步|运动|锻炼|exercise|gym|run|yoga|游泳/i.test(line)) return 'Exercise';
  if (/买|购物|缴费|取件|收拾|家务|shopping|grocer|clean/i.test(line)) return 'Life';
  return 'Other';
}

/** 计算某星期几在目标时区的日期（yyyy-MM-dd） */
function weekdayDate(todayInZone: string, targetDow: number): string {
  const base = new Date(`${todayInZone}T12:00:00Z`);
  const delta = (targetDow - base.getUTCDay() + 7) % 7;
  return format(addDays(base, delta), 'yyyy-MM-dd');
}

/** 把目标时区的本地日期+时刻转成 UTC ISO */
function toUtc(dateStr: string, hour: number, minute: number, timezone: string): string {
  const localIso = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  return fromZoneTime(localIso, timezone).toISOString();
}

interface ParsedLine {
  dow: number | null;
  timeRange: { sh: number; sm: number; eh: number; em: number } | null;
  singleTime: { h: number; m: number } | null;
  date: string | null;
  recurrence: RecurrenceSpec | null;
  hasDeadlineWord: boolean;
  title: string;
  location: string | null;
}

function parseLine(line: string, todayInZone: string): ParsedLine | null {
  const raw = line.trim();
  if (!raw || raw.length < 2) return null;

  let work = raw.replace(TITLE_NOISE, '').trim();
  if (!work) return null;

  // 地点：@地点 或 在地点 / 教学楼X / Room X
  let location: string | null = null;
  const locMatch = work.match(/[@＠]\s*([\u4e00-\u9fa5A-Za-z0-9\s-]+)/);
  if (locMatch) {
    location = locMatch[1].trim();
    work = work.replace(locMatch[0], ' ');
  }

  // 重复规则
  let recurrence: RecurrenceSpec | null = null;
  const biweekly = /每两周|隔周|biweekly|every\s*2\s*weeks?/i.test(work);
  if (biweekly) {
    recurrence = { freq: 'weekly', interval: 2, end_date: null, count: null };
    work = work.replace(/每两周|隔周|biweekly|every\s*2\s*weeks?/i, ' ');
  } else if (/每天|每日|daily|every\s*day/i.test(work)) {
    recurrence = { freq: 'daily', interval: 1, end_date: null, count: null };
    work = work.replace(/每天|每日|daily|every\s*day/i, ' ');
  } else if (/每周|每星期|weekly|every\s*week/i.test(work)) {
    recurrence = { freq: 'weekly', interval: 1, end_date: null, count: null };
    // 保留星期字符供后续 dow 解析：仅移除「每周/每星期/weekly」词本身
    work = work.replace(/每星期|每周|weekly|every\s*week/i, ' ');
  } else if (/每月|monthly|every\s*month/i.test(work)) {
    recurrence = { freq: 'monthly', interval: 1, end_date: null, count: null };
    work = work.replace(/每月|monthly|every\s*month/i, ' ');
  }

  // 有效期 / 截止周次：第1-16周 / until 2026-12-31
  const untilMatch = work.match(/until\s*(\d{4}-\d{2}-\d{2})/i);
  if (untilMatch && recurrence) {
    recurrence.end_date = untilMatch[1];
    work = work.replace(untilMatch[0], ' ');
  }
  const weeksMatch = work.match(/第\s*(\d+)\s*[-~至到]\s*(\d+)\s*周/);
  if (weeksMatch && recurrence) {
    recurrence.count = Number(weeksMatch[2]);
    work = work.replace(weeksMatch[0], ' ');
  }

  // 星期
  let dow: number | null = null;
  let weekdayToken = '';
  const weekdayPattern = /(周一|周二|周三|周四|周五|周六|周日|周天|星期一|星期二|星期三|星期四|星期五|星期六|星期日|星期天|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)/i;
  const wd = work.match(weekdayPattern);
  if (wd) {
    dow = WEEKDAYS[wd[1].toLowerCase()] ?? null;
    weekdayToken = wd[0];
    work = work.replace(weekdayToken, ' ');
  } else if (recurrence?.freq === 'weekly') {
    // 「每周一」移除「每周」后残留的单字符/数字星期
    const singleDow = work.match(/(?:^|\s)([一二三四五六日天1-7])(?=\s|$)/);
    if (singleDow) {
      const key = singleDow[1];
      dow = WEEKDAYS[key] ?? (key === '天' ? 0 : /[1-7]/.test(key) ? Number(key) % 7 : null);
      weekdayToken = singleDow[0];
      work = work.replace(singleDow[0], ' ');
    }
  }

  // 时间范围（先于日期解析，避免时间串中的数字干扰日期识别）
  let timeRange: ParsedLine['timeRange'] = null;
  let singleTime: ParsedLine['singleTime'] = null;
  const rangeMatch = work.match(/(\d{1,2})\s*[:：]\s*(\d{2})\s*[-–—~至到]\s*(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (rangeMatch) {
    timeRange = {
      sh: Number(rangeMatch[1]), sm: Number(rangeMatch[2]),
      eh: Number(rangeMatch[3]), em: Number(rangeMatch[4]),
    };
    work = work.replace(rangeMatch[0], ' ');
  } else {
    const single = work.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
    if (single) {
      singleTime = { h: Number(single[1]), m: Number(single[2]) };
      work = work.replace(single[0], ' ');
    }
  }

  // 显式日期（时间串已移除）
  let date: string | null = null;
  const isoDate = work.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoDate) {
    date = `${isoDate[1]}-${isoDate[2].padStart(2, '0')}-${isoDate[3].padStart(2, '0')}`;
    work = work.replace(isoDate[0], ' ');
  } else {
    const cnDate = work.match(/(0?[1-9]|1[0-2])\s*[月/-]\s*([0-2]?\d|3[01])\s*[日号]?(?!\d)/);
    if (cnDate) {
      const year = todayInZone.slice(0, 4);
      date = `${year}-${cnDate[1].padStart(2, '0')}-${cnDate[2].padStart(2, '0')}`;
      work = work.replace(cnDate[0], ' ');
    }
  }

  const hasDeadlineWord = DEADLINE_WORDS.test(work);
  if (hasDeadlineWord) {
    work = work.replace(DEADLINE_WORDS, ' ');
  }

  // 清理标题：去标点、压缩空格
  const title = work
    .replace(/[,，。;；:：、\-–—~()（）[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { dow, timeRange, singleTime, date, recurrence, hasDeadlineWord, title, location, ...(weekdayToken ? {} : {}) };
}

export interface ParseOptions {
  now: Date;
  timezone: string;
}

/**
 * 本地降级解析：把中英文课程表 / 待办文本解析为结构化候选项。
 * 无网络、无 API Key，AI 不可用时保证导入流程可用。
 */
export function parseLocalText(text: string, opts: ParseOptions): ImportCandidate[] {
  const todayInZone = formatInZone(opts.now, 'yyyy-MM-dd', opts.timezone);
  const lines = text.split(/\r?\n/);
  const out: ImportCandidate[] = [];

  for (const line of lines) {
    const p = parseLine(line, todayInZone);
    if (!p || !p.title) continue;

    const hasTime = Boolean(p.timeRange || p.singleTime);
    const isDeadline = p.hasDeadlineWord;
    // 无时间但有星期的行，视为课程（默认时段）
    const treatAsEvent = hasTime && !isDeadline;

    let confidence = 0.55;
    if (hasTime) confidence += 0.15;
    if (p.date) confidence += 0.12;
    if (p.dow !== null) confidence += 0.08;
    if (p.recurrence) confidence += 0.05;
    if (isDeadline && p.date) confidence += 0.05;
    confidence = Math.min(0.99, Number(confidence.toFixed(2)));

    let missingDate = false;

    if (treatAsEvent) {
      const dateStr = p.date ?? (p.dow !== null ? weekdayDate(todayInZone, p.dow) : null);
      if (!dateStr) missingDate = true;
      const sh = p.timeRange?.sh ?? p.singleTime?.h ?? 9;
      const sm = p.timeRange?.sm ?? p.singleTime?.m ?? 0;
      const eh = p.timeRange?.eh ?? sh + 1;
      const em = p.timeRange?.em ?? sm;
      const startAt = dateStr ? toUtc(dateStr, sh, sm, opts.timezone) : '';
      const endAt = dateStr ? toUtc(dateStr, eh, em, opts.timezone) : '';
      out.push({
        id: makeId(),
        kind: 'create_event',
        title: p.title,
        start_at: startAt,
        end_at: endAt,
        all_day: false,
        location: p.location,
        recurrence: p.recurrence,
        category_name: inferCategory(p.title),
        confidence,
        needsConfirm: missingDate || confidence < 0.75,
        flags: { missingDate },
        conflicts: [],
        source: line.trim(),
      });
      continue;
    }

    // 截止日期 / 任务
    const dueDate = p.date ?? (p.dow !== null ? weekdayDate(todayInZone, p.dow) : null);
    if (!dueDate) missingDate = true;
    const dueAt = dueDate ? toUtc(dueDate, 23, 59, opts.timezone) : '';
    out.push({
      id: makeId(),
      kind: isDeadline ? 'create_deadline' : 'create_task',
      title: p.title,
      due_at: dueAt,
      recurrence: null,
      category_name: isDeadline ? undefined : inferCategory(p.title),
      confidence: missingDate ? Math.min(confidence, 0.6) : confidence,
      needsConfirm: missingDate || confidence < 0.75,
      flags: { missingDate },
      conflicts: [],
      source: line.trim(),
    });
  }

  return out;
}

/**
 * 给候选项标注冲突与重复，供预览阶段提示（不修改数据）。
 * conflicts: 与现有日程时间重叠；duplicate: 标题与现有日程高度相似。
 */
export function annotateRisks(candidates: ImportCandidate[], existingTitles: string[]): ImportCandidate[] {
  // 仅移除空白与标点，保留中文等 Unicode 文字（\W 会把中文一并过滤，导致中文标题重复检测失效）
  const normalize = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}_]/gu, '');
  const existingNorm = existingTitles.map(normalize);
  return candidates.map((c) => {
    const norm = normalize(c.title);
    const duplicate = norm.length > 1 && existingNorm.some(
      (e) => e.length > 1 && (e === norm || (e.includes(norm) && norm.length >= 4) || (norm.includes(e) && e.length >= 4)),
    );
    const flags = { ...c.flags, duplicate };
    return { ...c, flags, needsConfirm: c.needsConfirm || duplicate };
  });
}
