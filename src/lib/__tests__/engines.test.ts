import { describe, it, expect } from 'vitest';
import { parseLocalText, annotateRisks } from '@/lib/importParser';
import { runLocalAssistant } from '@/lib/assistantEngine';
import { rankTasks, buildPlan } from '@/lib/planningEngine';
import { scanDueItems } from '@/lib/notification';
import { formatInZone } from '@/lib/timezone';
import { makeContext, makeEvent, makeTask, makeDeadline } from '@/test/factories';

const parseOpts = { now: new Date('2026-11-18T02:00:00.000Z'), timezone: 'Asia/Singapore' };

describe('importParser', () => {
  it('解析中文课程行（每周 + 时段 + 地点）', () => {
    const items = parseLocalText('每周一 09:00-10:30 高等数学 @教学楼A301', parseOpts);
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.kind).toBe('create_event');
    expect(item.title).toContain('高等数学');
    expect(item.location).toContain('教学楼A301');
    expect(item.recurrence?.freq).toBe('weekly');
    // 09:00 SGT = 01:00Z
    expect(item.start_at).toMatch(/T01:00/);
  });

  it('解析截止行并识别 DDL 关键词', () => {
    const items = parseLocalText('DDL 12/20 Project report', parseOpts);
    const deadline = items.find((i) => i.kind === 'create_deadline');
    expect(deadline).toBeDefined();
    expect(deadline?.title).toContain('Project report');
    expect(deadline?.due_at).toMatch(/^2026-12-20/);
  });

  it('缺日期的待办标记 missingDate 且需确认', () => {
    const items = parseLocalText('买牛奶', parseOpts);
    expect(items).toHaveLength(1);
    expect(items[0].flags.missingDate).toBe(true);
    expect(items[0].needsConfirm).toBe(true);
  });

  it('annotateRisks 标注与已有日程重复的候选', () => {
    const items = parseLocalText('高等数学 09:00-10:30', parseOpts);
    const flagged = annotateRisks(items, ['高等数学']);
    expect(flagged[0].flags.duplicate).toBe(true);
  });
});

describe('assistantEngine', () => {
  const ctx = makeContext({
    events: [makeEvent({ title: '高等数学', start_at: '2026-11-19T01:00:00.000Z', end_at: '2026-11-19T02:30:00.000Z' })],
    tasks: [makeTask({ id: 't1', title: '复习线性代数', due_at: '2026-11-18T16:00:00.000Z' })],
  });

  it('查询今天返回现有任务且不产生待确认操作', () => {
    const reply = runLocalAssistant('今天有什么安排？', ctx, 'zh-CN');
    expect(reply.message).toContain('复习线性代数');
    expect(reply.pendingActions).toHaveLength(0);
  });

  it('查空闲返回空闲信息', () => {
    const reply = runLocalAssistant('明天下午有空吗？', ctx, 'zh-CN');
    expect(reply.message).toContain('空闲');
    expect(reply.pendingActions).toHaveLength(0);
  });

  it('创建日程生成待确认操作且时区正确', () => {
    const reply = runLocalAssistant('明天 14:00-15:00 和张三开会', ctx, 'zh-CN');
    expect(reply.pendingActions).toHaveLength(1);
    const action = reply.pendingActions[0];
    expect(action.kind).toBe('create_event');
    expect(String(action.payload.title)).toContain('张三');
    // 14:00 SGT = 06:00Z
    expect(String(action.payload.start_at)).toMatch(/^2026-11-19T06:00/);
  });

  it('「提醒我周五前交报告」被识别为截止而非任务', () => {
    const reply = runLocalAssistant('提醒我周五前交报告', ctx, 'zh-CN');
    expect(reply.pendingActions).toHaveLength(1);
    const action = reply.pendingActions[0];
    expect(action.kind).toBe('create_deadline');
    expect(String(action.payload.title)).toContain('报告');
    expect(String(action.payload.title)).not.toContain('前');
  });

  it('创建任务与帮助意图', () => {
    const taskReply = runLocalAssistant('创建任务：买牛奶', ctx, 'zh-CN');
    expect(taskReply.pendingActions[0].kind).toBe('create_task');
    const help = runLocalAssistant('你能做什么', ctx, 'zh-CN');
    expect(help.pendingActions).toHaveLength(0);
    expect(help.message).toContain('今天');
  });
});

describe('planningEngine', () => {
  const ctx = makeContext({
    events: [makeEvent({ title: '高等数学', start_at: '2026-11-18T01:00:00.000Z', end_at: '2026-11-18T02:30:00.000Z' })],
    tasks: [
      makeTask({ id: 't1', title: '写周报', priority: 'low', due_at: '2026-11-20T16:00:00.000Z', estimated_minutes: 30 }),
      makeTask({ id: 't2', title: '复习考试', priority: 'urgent', due_at: '2026-11-18T23:00:00.000Z', estimated_minutes: 60 }),
      makeTask({ id: 't3', title: '买牛奶', priority: 'medium', due_at: null, estimated_minutes: 30 }),
    ],
  });

  it('rankTasks 按优先级排序', () => {
    expect(rankTasks(ctx.tasks).map((t) => t.id)).toEqual(['t2', 't3', 't1']);
  });

  it('planDay 只产出 create_event 且 urgent 优先', () => {
    const plan = buildPlan(ctx, 'day', 'zh-CN');
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.actions.every((a) => a.kind === 'create_event')).toBe(true);
    expect(String(plan.actions[0].payload.title)).toContain('复习考试');
  });

  it('不覆盖已有课程', () => {
    const plan = buildPlan(ctx, 'day', 'zh-CN');
    const overlap = plan.actions.filter((a) => a.conflicts.some((c) => c.includes('高等数学')));
    expect(overlap).toHaveLength(0);
  });

  it('无任务与全完成时不产出草案', () => {
    expect(buildPlan({ ...ctx, tasks: [] }, 'day', 'zh-CN').actions).toHaveLength(0);
    const done = makeTask({ is_completed: true });
    expect(buildPlan({ ...ctx, tasks: [done] }, 'day', 'en-US').actions).toHaveLength(0);
  });

  it('reschedule 覆盖多日', () => {
    expect(buildPlan(ctx, 'reschedule', 'zh-CN').actions.length).toBeGreaterThan(0);
  });
});

describe('notification.scanDueItems', () => {
  const now = new Date('2026-11-18T02:00:00.000Z'); // SGT 10:00
  const opts = { now, timezone: 'Asia/Singapore', leadMinutes: 30 };

  it('捕获窗口内任务，跳过超窗/过期/已完成/无提醒', () => {
    const inWindow = makeTask({ id: 't1', due_at: '2026-11-18T02:20:00.000Z', remind_at: '2026-11-18T02:20:00.000Z' });
    expect(scanDueItems([inWindow], [], [], opts)).toHaveLength(1);
    expect(scanDueItems([makeTask({ due_at: '2026-11-18T02:45:00.000Z', remind_at: 'x' })], [], [], opts)).toHaveLength(0);
    expect(scanDueItems([makeTask({ due_at: '2026-11-18T01:00:00.000Z', remind_at: 'x' })], [], [], opts)).toHaveLength(0);
    expect(scanDueItems([makeTask({ due_at: '2026-11-18T02:20:00.000Z', is_completed: true, remind_at: 'x' })], [], [], opts)).toHaveLength(0);
    expect(scanDueItems([makeTask({ due_at: '2026-11-18T02:20:00.000Z', remind_at: null })], [], [], opts)).toHaveLength(0);
  });

  it('混合类型按时间升序并区分类型', () => {
    const task = makeTask({ id: 't1', due_at: '2026-11-18T02:20:00.000Z', remind_at: 'x' });
    const deadline = makeDeadline({ id: 'd1', due_at: '2026-11-18T02:10:00.000Z' });
    const event = makeEvent({ id: 'e1', start_at: '2026-11-18T02:25:00.000Z' });
    const items = scanDueItems([task], [deadline], [event], opts);
    expect(items.map((i) => i.type)).toEqual(['deadline_reminder', 'task_reminder', 'event_reminder']);
    expect(items[1].dueLabel).toContain('10:20');
  });

  it('跳过 finished 截止与 cancelled 日程，尊重 seen 去重', () => {
    const finished = makeDeadline({ status: 'finished' });
    const cancelled = makeEvent({ is_cancelled: true });
    expect(scanDueItems([], [finished], [cancelled], opts)).toHaveLength(0);
    const task = makeTask({ id: 't1', due_at: '2026-11-18T02:20:00.000Z', remind_at: 'x' });
    const seen = new Set([`task:t1:${task.due_at}`]);
    expect(scanDueItems([task], [], [], { ...opts, seen })).toHaveLength(0);
  });

  it('dueLabel 使用用户时区格式化', () => {
    expect(formatInZone('2026-11-18T02:20:00.000Z', 'HH:mm', 'Asia/Singapore')).toBe('10:20');
  });
});
