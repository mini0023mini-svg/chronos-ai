import { addDays, addMinutes, format, parseISO } from 'date-fns';
import type { AiContext, AiReply } from '@/types/api';
import type { CalendarEvent, PendingAction } from '@/types/models';
import type { Locale } from '@/types/enums';
import { detectConflicts, type RecurrenceSpec } from './recurrence';
import { formatInZone, fromZoneTime } from './timezone';
import { makeId } from './utils';

/**
 * 本地对话规则引擎（AI 网关未部署时的降级核心）。
 * 纯函数：给定消息 + 用户数据快照，返回回复文本与待确认操作。
 * 绝不写库——所有写操作必须经 PendingAction 由用户确认（确认闸门）。
 */

export type AssistantIntent =
  | 'create_event'
  | 'create_task'
  | 'create_deadline'
  | 'query'
  | 'free'
  | 'help'
  | 'unknown';

const WEEKDAYS: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0,
  周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6, 周日: 0, 周天: 0,
  星期一: 1, 星期二: 2, 星期三: 3, 星期四: 4, 星期五: 5, 星期六: 6, 星期日: 0, 星期天: 0,
  monday: 1, mon: 1, tuesday: 2, tue: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6, sunday: 0, sun: 0,
};

function inferCategory(text: string): string {
  if (/数学|物理|化学|英语|语文|生物|历史|课|lecture|class|实验|lab|复习|考试|exam/i.test(text)) return 'Study';
  if (/会议|meeting|工作|work|报告|report|项目|project|standup|面试|interview/i.test(text)) return 'Work';
  if (/健身|跑步|运动|锻炼|exercise|gym|run|yoga|游泳/i.test(text)) return 'Exercise';
  if (/买|购物|缴费|取件|收拾|家务|shopping|grocer|clean/i.test(text)) return 'Life';
  return 'Other';
}

/** 目标星期几的日期（yyyy-MM-dd，用户时区日历日）；nextWeek 表示"下周一" */
function weekdayDate(todayStr: string, dow: number, nextWeek: boolean): string {
  const base = parseISO(todayStr);
  const mondayDelta = (base.getDay() + 6) % 7;
  const thisMonday = addDays(base, -mondayDelta);
  let target = addDays(thisMonday, (dow + 6) % 7);
  if (nextWeek || target.getTime() < base.getTime()) target = addDays(target, 7);
  return format(target, 'yyyy-MM-dd');
}

interface TimeParse {
  dateStr: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  hasTime: boolean;
  /** 从原文中移除已消费的时间表达，剩下的作为标题 */
  rest: string;
}

/** 解析相对日期 + 时刻；只识别单一时间点/区间，复杂多事件交给 AI 网关或导入页 */
function parseWhen(text: string, ctx: AiContext): TimeParse {
  let work = ` ${text} `;
  let dateStr = ctx.date;

  // 日期词（今天/明天/后天/昨天）
  const rel = work.match(/(今天|今日|今晚|tomorrow|明天|明日|后天|大后天|昨天|昨日|yesterday)/i);
  if (rel) {
    const map: Record<string, number> = {
      今天: 0, 今日: 0, 今晚: 0, tomorrow: 1, 明天: 1, 明日: 1,
      后天: 2, 大后天: 3, 昨天: -1, 昨日: -1, yesterday: -1,
    };
    dateStr = format(addDays(parseISO(ctx.date), map[rel[1].toLowerCase()] ?? 0), 'yyyy-MM-dd');
    work = work.replace(rel[0], ' ');
  } else {
    // ISO / 中文日期
    const iso = work.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (iso) {
      dateStr = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
      work = work.replace(iso[0], ' ');
    } else {
      const cn = work.match(/(0?[1-9]|1[0-2])\s*[月/-]\s*([0-2]?\d|3[01])\s*[日号]?(?!\d)/);
      if (cn) {
        dateStr = `${ctx.date.slice(0, 4)}-${cn[1].padStart(2, '0')}-${cn[2].padStart(2, '0')}`;
        work = work.replace(cn[0], ' ');
      } else {
        // 星期：下周X / 周X / 星期X / weekday 英文
        const next = /下\s*(周|星期|week)/i.test(work);
        const wd = work.match(/(下\s*)?(周一|周二|周三|周四|周五|周六|周日|周天|星期一|星期二|星期三|星期四|星期五|星期六|星期日|星期天|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)/i);
        if (wd) {
          const dow = WEEKDAYS[wd[2].toLowerCase()] ?? null;
          if (dow !== null) {
            dateStr = weekdayDate(ctx.date, dow, next);
            work = work.replace(wd[0], ' ');
            work = work.replace(/下\s*(周|星期|week)/i, ' ');
          }
        }
      }
    }
  }

  // 时段词：上午/下午/晚上 影响 12 小时制换算
  let meridiem: 'am' | 'pm' | null = null;
  const mer = work.match(/(上午|早上|早晨|中午|下午|傍晚|晚上|今晚|夜里|am|pm)/i);
  if (mer) {
    const key = mer[1].toLowerCase();
    meridiem = ['下午', '傍晚', '晚上', '今晚', '夜里', 'pm'].includes(key) ? 'pm' : 'am';
    work = work.replace(mer[0], ' ');
  }

  // 时间区间 HH:mm-HH:mm / H点-H点
  let sh = 9;
  let sm = 0;
  let eh = 10;
  let em = 0;
  let hasTime = false;
  const range = work.match(/(\d{1,2})\s*[:：点]\s*(\d{1,2})?\s*分?\s*[-–—~至到]\s*(\d{1,2})\s*[:：点]\s*(\d{1,2})?\s*分?/);
  if (range) {
    sh = Number(range[1]);
    sm = Number(range[2] ?? 0);
    eh = Number(range[3]);
    em = Number(range[4] ?? 0);
    hasTime = true;
    work = work.replace(range[0], ' ');
  } else {
    const single = work.match(/(\d{1,2})\s*[:：点]\s*(\d{1,2})?\s*分?/);
    if (single) {
      sh = Number(single[1]);
      sm = Number(single[2] ?? 0);
      eh = sh + 1;
      em = sm;
      hasTime = true;
      work = work.replace(single[0], ' ');
    }
  }
  if (hasTime) {
    if (meridiem === 'pm' && sh < 12) sh += 12;
    if (meridiem === 'am' && sh === 12) sh = 0;
    if (meridiem === 'pm' && eh < 12) eh += 12;
    if (eh <= sh && em === sm) eh = sh + 1;
    if (eh < sh) eh += 12;
  } else if (meridiem === 'pm') {
    sh = 15; eh = 16;
    hasTime = true;
  } else if (meridiem === 'am') {
    sh = 9; eh = 10;
    hasTime = true;
  }

  return {
    dateStr,
    startHour: sh,
    startMinute: sm,
    endHour: eh,
    endMinute: em,
    hasTime,
    rest: work.replace(/\s+/g, ' ').trim(),
  };
}

function toUtc(dateStr: string, hour: number, minute: number, timezone: string): string {
  const localIso = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  return fromZoneTime(localIso, timezone).toISOString();
}

function cleanTitle(rest: string): string {
  return rest
    .replace(/^(帮我|请|麻烦|我要|我想|能不能|可以|给|把|安排|新建|创建|添加|加|记一下|记得|提醒我|设置|设个|建立|增加|新增)+/i, '')
    .replace(/^(前|之前|以前)(?=交|提交|截止|ddl|deadline)/i, ' ')
    .replace(/(一个|一个|下|的|吧|呢|了|哦|哈|please|help me|add|create|new|set|schedule|remind me|for me)\b/gi, ' ')
    .replace(/[,，。;；:：、\-–—~()（）[\]!！?？]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const COPY = {
  'zh-CN': {
    intro: '我可以查询日程、找空闲时间，或帮你新建日程/任务/截止日期。所有改动都需要你确认后才会写入。',
    help: '试试这样说：\n• 今天有什么安排？\n• 明天下午有空吗？\n• 明天 14:00-15:00 和张三开会\n• 提醒我周五前交报告\n• 创建一个任务：买牛奶',
    queryEmpty: '这一天没有找到相关记录。',
    queryEvents: '日程：',
    queryTasks: '任务：',
    queryDeadlines: '截止：',
    freeIntro: '{date} 的空闲时段（{tz}）：',
    freeNone: '这一天 08:00–22:00 都排满了。',
    freeItem: '• {start}–{end}（{mins} 分钟）',
    createdEvent: '已生成 1 条日程待确认：{title}（{date} {time}）。点击确认写入，或直接忽略。',
    createdTask: '已生成 1 条任务待确认：{title}{due}。',
    createdDeadline: '已生成 1 条截止待确认：{title}{due}。',
    missingTitle: '没有识别出事项标题，请换个说法，例如「明天 15:00 开会」。',
    fallback: '我理解了你的意思，但暂时无法可靠地执行。你可以用更具体的时间与标题描述，或到「AI 导入」批量识别。',
    conflictHint: '检测到时间冲突，确认前请留意。',
  },
  'en-US': {
    intro: 'I can query your schedule, find free time, or create events, tasks and deadlines. Every change needs your confirmation before it is written.',
    help: 'Try saying:\n• What is on my schedule today?\n• Am I free tomorrow afternoon?\n• Meeting with Tom tomorrow 2pm-3pm\n• Remind me to submit the report by Friday\n• Create a task: buy milk',
    queryEmpty: 'Nothing found for that day.',
    queryEvents: 'Events:',
    queryTasks: 'Tasks:',
    queryDeadlines: 'Deadlines:',
    freeIntro: 'Free slots on {date} ({tz}):',
    freeNone: 'No free slots between 08:00 and 22:00 that day.',
    freeItem: '• {start}–{end} ({mins} min)',
    createdEvent: '1 event ready to confirm: {title} ({date} {time}). Click Confirm to write, or ignore it.',
    createdTask: '1 task ready to confirm: {title}{due}.',
    createdDeadline: '1 deadline ready to confirm: {title}{due}.',
    missingTitle: 'I could not identify a title. Try something like "Meeting tomorrow 3pm".',
    fallback: 'I understood you, but cannot execute this reliably yet. Try a more specific time and title, or use AI Import for batch recognition.',
    conflictHint: 'Time conflict detected — please review before confirming.',
  },
} as const;

function detectIntent(message: string): AssistantIntent {
  const m = message.toLowerCase();
  if (/^(help|帮助|你能|能做什么|怎么用|what can you)/.test(m)) return 'help';

  const deadlineWord = /截止|deadline|ddl|due\s*(date|by)?|提交|交作业|交报告|交论文|交\[|到期|(周|星期)[一二三四五六日天]?前|\d+号?前/i.test(m);
  const taskWord = /任务|待办|todo|to\s*do|提醒我|记得|买|购物|背诵|复习任务|task/i.test(m);
  const eventWord = /会议|开会|meeting|课|上课|lecture|class|考试|exam|预约|appoint|面试|interview|健身|gym|约/i.test(m);
  const hasTime = /\d{1,2}\s*[:：点]/.test(m) || /上午|下午|晚上|早上|中午|am|pm/i.test(m);

  // 查询优先：问句或"看看/有什么/安排"
  if (/^\s*(what|when|which|how many|show|list)/.test(m) || /(有什么|哪些|看看|列出|显示|我的.*(安排|日程|任务|截止)|今天.*(安排|有什么)|明天.*(安排|有什么)|schedule for|on my (calendar|schedule)|any (tasks|meetings))/.test(m)) {
    if (!/(新建一个|创建|添加|提醒我|帮我建|帮我安排|schedule a|create a|add a)/.test(m)) return 'query';
  }
  if (/(空闲|有空|什么时候有|free time|available|busy|忙不忙)/.test(m)) return 'free';

  // 创建意图：需有创建动词或明确事项 + 时间
  const createVerb = /(新建|创建|添加|增加|加个|加一个|安排|帮我|请|提醒我|记得|set up|create|add|schedule|book|remind)/i.test(m);
  if (deadlineWord && (createVerb || hasTime || /前|by/i.test(m))) return 'create_deadline';
  if (eventWord && (createVerb || hasTime)) return 'create_event';
  if (taskWord && createVerb) return 'create_task';
  if (hasTime && createVerb) return 'create_event';
  if (/^(what|show|list|今天|明天|本周|这周|我的)/.test(m)) return 'query';
  return 'unknown';
}

/** 某天按 30 分钟粒度计算空闲时段（08:00–22:00，用户时区） */
function findFreeSlots(ctx: AiContext, dateStr: string, minMinutes = 60): Array<{ start: string; end: string; minutes: number }> {
  const dayStart = parseISO(`${dateStr}T08:00:00`);
  const dayEnd = parseISO(`${dateStr}T22:00:00`);
  const busy: Array<[number, number]> = ctx.events
    .filter((e) => !e.is_cancelled && (e.occurrence_date ?? e.start_at.slice(0, 10)) === dateStr)
    .map((e) => [new Date(e.start_at).getTime(), new Date(e.end_at).getTime()] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];
  for (const [s, e] of busy) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }

  const slots: Array<{ start: string; end: string; minutes: number }> = [];
  let cursor = dayStart.getTime();
  for (const [s, e] of merged) {
    if (s - cursor >= minMinutes * 60 * 1000) {
      slots.push({ start: formatInZone(new Date(cursor), 'HH:mm', ctx.timezone), end: formatInZone(new Date(s), 'HH:mm', ctx.timezone), minutes: Math.round((s - cursor) / 60000) });
    }
    cursor = Math.max(cursor, e);
  }
  if (dayEnd.getTime() - cursor >= minMinutes * 60 * 1000) {
    slots.push({ start: formatInZone(new Date(cursor), 'HH:mm', ctx.timezone), end: '22:00', minutes: Math.round((dayEnd.getTime() - cursor) / 60000) });
  }
  return slots;
}

function queryReply(ctx: AiContext, message: string, locale: Locale): string {
  const c = COPY[locale];
  const w = parseWhen(message, ctx);
  const dateStr = w.dateStr;
  const events = ctx.events.filter((e) => !e.is_cancelled && (e.occurrence_date ?? e.start_at.slice(0, 10)) === dateStr)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  const tasks = ctx.tasks.filter((t) => !t.is_completed && t.due_at?.slice(0, 10) === dateStr);
  const deadlines = ctx.deadlines.filter((d) => d.status !== 'finished' && d.due_at.slice(0, 10) === dateStr);
  const label = formatInZone(new Date(`${dateStr}T12:00:00Z`), 'yyyy-MM-dd EEEE', ctx.timezone);

  if (events.length === 0 && tasks.length === 0 && deadlines.length === 0) {
    return `${label} · ${c.queryEmpty}`;
  }
  const lines = [`${label}`];
  if (events.length) lines.push(c.queryEvents, ...events.map((e) => `• ${formatInZone(e.start_at, 'HH:mm', ctx.timezone)} ${e.title}${e.location ? ` @${e.location}` : ''}`));
  if (tasks.length) lines.push(c.queryTasks, ...tasks.map((t) => `• ${t.title}`));
  if (deadlines.length) lines.push(c.queryDeadlines, ...deadlines.map((d) => `• ${d.title} · ${formatInZone(d.due_at, 'HH:mm', ctx.timezone)}`));
  return lines.join('\n');
}

function buildCreateAction(
  intent: 'create_event' | 'create_task' | 'create_deadline',
  message: string,
  ctx: AiContext,
  locale: Locale,
): { reply: string; action: PendingAction | null } {
  const c = COPY[locale];
  const w = parseWhen(message, ctx);
  // 「周五前交报告」在 parseWhen 移除「周五」后残留前导「前」，deadline 意图下清理
  const title = cleanTitle(w.rest).replace(/^前(?=[交提缴做完截])/, ' ').trim();
  if (!title) return { reply: c.missingTitle, action: null };

  const due = (hour: number, minute: number) => toUtc(w.dateStr, hour, minute, ctx.timezone);
  const dateLabel = formatInZone(new Date(`${w.dateStr}T12:00:00Z`), 'MM-dd', ctx.timezone);
  const timeLabel = w.hasTime
    ? `${String(w.startHour).padStart(2, '0')}:${String(w.startMinute).padStart(2, '0')}`
    : '';

  if (intent === 'create_event') {
    const startAt = toUtc(w.dateStr, w.startHour, w.startMinute, ctx.timezone);
    const endAt = toUtc(w.dateStr, w.endHour, w.endMinute, ctx.timezone);
    const conflicts = detectConflicts(
      { id: undefined, start_at: startAt, end_at: endAt, all_day: false },
      ctx.events,
    ).map((e: CalendarEvent) => e.title);
    const recurrence: RecurrenceSpec | null = /每周|weekly|每星期/i.test(message)
      ? { freq: 'weekly', interval: 1, end_date: null, count: null }
      : null;
    const action: PendingAction = {
      id: makeId(),
      kind: 'create_event',
      payload: {
        title,
        description: null,
        location: null,
        start_at: startAt,
        end_at: endAt,
        all_day: false,
        category_id: null,
        category_name: inferCategory(title),
        timezone: ctx.timezone,
        recurrence,
      },
      description: `${title} · ${dateLabel}${timeLabel ? ` ${timeLabel}` : ''}`,
      conflicts,
    };
    const vars = { title, date: dateLabel, time: timeLabel || '—' };
    return {
      reply: c.createdEvent.replace('{title}', vars.title).replace('{date}', vars.date).replace('{time}', vars.time)
        + (conflicts.length ? `\n⚠️ ${c.conflictHint}（${conflicts.join('、')}）` : ''),
      action,
    };
  }

  if (intent === 'create_task') {
    const action: PendingAction = {
      id: makeId(),
      kind: 'create_task',
      payload: {
        title,
        notes: null,
        category_id: null,
        category_name: inferCategory(title),
        priority: 'medium',
        estimated_minutes: null,
        due_at: w.hasTime || w.dateStr !== ctx.date ? due(w.endHour, w.endMinute) : null,
        timezone: ctx.timezone,
      },
      description: `${title}${w.dateStr !== ctx.date || w.hasTime ? ` · ${dateLabel}${timeLabel ? ` ${timeLabel}` : ''}` : ''}`,
      conflicts: [],
    };
    return { reply: c.createdTask.replace('{title}', title).replace('{due}', action.description.slice(title.length)), action };
  }

  const action: PendingAction = {
    id: makeId(),
    kind: 'create_deadline',
    payload: {
      title,
      description: null,
      due_at: due(w.hasTime ? w.endHour : 23, w.hasTime ? w.endMinute : 59),
      status: 'not_started',
      timezone: ctx.timezone,
    },
    description: `${title} · ${dateLabel}${w.hasTime ? ` ${String(w.endHour).padStart(2, '0')}:${String(w.endMinute).padStart(2, '0')}` : ''}`,
    conflicts: [],
  };
  return { reply: c.createdDeadline.replace('{title}', title).replace('{due}', ` · ${dateLabel}`), action };
}

/**
 * 本地助手主入口：纯函数，返回回复 + 待确认操作（调用方负责展示确认卡片）。
 */
export function runLocalAssistant(message: string, ctx: AiContext, locale: Locale): AiReply {
  const c = COPY[locale];
  const intent = detectIntent(message);
  const w = parseWhen(message, ctx);

  if (intent === 'help') return { message: c.help, pendingActions: [] };

  if (intent === 'free') {
    const slots = findFreeSlots(ctx, w.dateStr);
    const label = formatInZone(new Date(`${w.dateStr}T12:00:00Z`), 'yyyy-MM-dd EEEE', ctx.timezone);
    const body = slots.length
      ? slots.slice(0, 5).map((s) => c.freeItem.replace('{start}', s.start).replace('{end}', s.end).replace('{mins}', String(s.minutes))).join('\n')
      : c.freeNone;
    return { message: `${c.freeIntro.replace('{date}', label).replace('{tz}', ctx.timezone)}\n${body}`, pendingActions: [] };
  }

  if (intent === 'query') return { message: queryReply(ctx, message, locale), pendingActions: [] };

  if (intent === 'create_event' || intent === 'create_task' || intent === 'create_deadline') {
    const built = buildCreateAction(intent, message, ctx, locale);
    return { message: built.reply, pendingActions: built.action ? [built.action] : [] };
  }

  return { message: c.fallback, pendingActions: [] };
}

/** 供 UI 展示的意图提示（不需要 AI 网关也能给出引导语） */
export function assistantIntro(locale: Locale): string {
  return COPY[locale].intro;
}

/** 计算空闲时段（导出供智能规划等模块复用） */
export { findFreeSlots };

/** 把待确认操作的时间载荷格式化为可读标签 */
export function describePendingAction(action: PendingAction, timezone: string, locale: Locale): string {
  const p = action.payload;
  const fmt = (v: unknown) => (typeof v === 'string' ? formatInZone(v, locale === 'zh-CN' ? 'MM-dd HH:mm' : 'MMM d HH:mm', timezone) : '');
  if (action.kind === 'create_event') return `${String(p.title ?? '')} · ${fmt(p.start_at)} → ${fmt(p.end_at)}`;
  if (action.kind === 'create_task') return `${String(p.title ?? '')}${p.due_at ? ` · ${fmt(p.due_at)}` : ''}`;
  return `${String(p.title ?? '')} · ${fmt(p.due_at)}`;
}

/** 将某日历日加上分钟数后格式化（便于扩展） */
export function shiftLabel(dateStr: string, minutes: number, timezone: string): string {
  return formatInZone(addMinutes(parseISO(`${dateStr}T00:00:00Z`), minutes), 'HH:mm', timezone);
}
