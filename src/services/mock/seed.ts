import type {
  ActivityLog,
  AiConversation,
  AppNotification,
  CalendarEvent,
  Category,
  Deadline,
  ImportItem,
  ImportRecord,
  Profile,
  RecurringRule,
  Task,
} from '@/types/models';
import { DEFAULT_TIMEZONE } from '@/lib/timezone';

/** Phase 1 mock 数据的固定 user_id（非真实账号） */
export const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';

const now = new Date();
const iso = (offsetDays = 0, hour = 9, minute = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const base = () => ({
  user_id: MOCK_USER_ID,
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
  deleted_at: null,
  timezone: DEFAULT_TIMEZONE,
});

export const mockProfile: Profile = {
  ...base(),
  id: 'profile-1',
  display_name: 'Demo User',
  avatar_url: null,
  language: 'zh-CN',
  theme: 'light',
};

export const mockCategories: Category[] = [
  ['Study', '#829CC4'],
  ['Work', '#A0BDA7'],
  ['Personal', '#E8C77B'],
  ['Exercise', '#D98C8C'],
  ['Life', '#B4A7D9'],
  ['Other', '#8B9099'],
].map(([name, color], i) => ({
  ...base(),
  id: `cat-${i + 1}`,
  name,
  color,
  icon: null,
  is_default: true,
  sort_order: i + 1,
}));

/** 为每周重复课程物化后续 N 周实例，供「仅此次 / 此后全部 / 全部」验证 */
function weeklyInstances(
  idPrefix: string,
  title: string,
  description: string | null,
  location: string,
  weekdayOffset: number,
  startHour: number,
  endHour: number,
  categoryId: string,
  ruleId: string,
  weeks: number,
): CalendarEvent[] {
  return Array.from({ length: weeks }, (_, week) => {
    const dayOffset = weekdayOffset + week * 7;
    return {
      ...base(),
      id: `${idPrefix}-${week}`,
      title,
      description,
      location,
      start_at: iso(dayOffset, startHour, 0),
      end_at: iso(dayOffset, endHour, 0),
      all_day: false,
      category_id: categoryId,
      calendar_key: 'default',
      recurrence_rule_id: ruleId,
      original_event_id: week === 0 ? null : `${idPrefix}-0`,
      is_exception: false,
      is_cancelled: false,
      occurrence_date: iso(dayOffset).slice(0, 10),
    };
  });
}

export const mockEvents: CalendarEvent[] = [
  // 高等数学：每周一 09:00-10:30，物化 4 周
  ...weeklyInstances('evt-math', '高等数学', '第 8 讲：多元函数微分', '教学楼 A-301', 0, 9, 10.5, 'cat-1', 'rule-1', 4),
  // 数据结构实验：每周四 14:00-16:00，物化 4 周
  ...weeklyInstances('evt-ds', '数据结构实验', null, '实验楼 B-205', 3, 14, 16, 'cat-1', 'rule-2', 4),
  {
    ...base(),
    id: 'evt-3',
    title: '团队周会',
    description: '同步本周进度',
    location: '线上',
    start_at: iso(1, 10, 0),
    end_at: iso(1, 11, 0),
    all_day: false,
    category_id: 'cat-2',
    calendar_key: 'default',
    recurrence_rule_id: null,
    original_event_id: null,
    is_exception: false,
    is_cancelled: false,
    occurrence_date: iso(1).slice(0, 10),
  },
];

export const mockRecurringRules: RecurringRule[] = [
  {
    ...base(),
    id: 'rule-1',
    title: '高等数学',
    freq: 'weekly',
    interval: 1,
    by_weekday: [1],
    by_month_day: null,
    start_date: iso(0).slice(0, 10),
    end_date: null,
    count: null,
    superseded_by: null,
  },
  {
    ...base(),
    id: 'rule-2',
    title: '数据结构实验',
    freq: 'weekly',
    interval: 1,
    by_weekday: [4],
    by_month_day: null,
    start_date: iso(0).slice(0, 10),
    end_date: null,
    count: null,
    superseded_by: null,
  },
];

export const mockTasks: Task[] = [
  {
    ...base(),
    id: 'task-1',
    title: '完成多维积分习题',
    notes: '第 3、4 题',
    category_id: 'cat-1',
    priority: 'high',
    estimated_minutes: 90,
    due_at: iso(1, 23, 59),
    remind_at: iso(1, 20, 0),
    is_completed: false,
    completed_at: null,
    parent_task_id: null,
    event_id: null,
  },
  {
    ...base(),
    id: 'task-2',
    title: '提交项目周报',
    notes: null,
    category_id: 'cat-2',
    priority: 'medium',
    estimated_minutes: 30,
    due_at: iso(0, 18, 0),
    remind_at: null,
    is_completed: false,
    completed_at: null,
    parent_task_id: null,
    event_id: null,
  },
  {
    ...base(),
    id: 'task-3',
    title: '阅读论文摘要',
    notes: null,
    category_id: 'cat-1',
    priority: 'low',
    estimated_minutes: 45,
    due_at: iso(3, 23, 59),
    remind_at: null,
    is_completed: false,
    completed_at: null,
    parent_task_id: null,
    event_id: null,
  },
  {
    ...base(),
    id: 'task-4',
    title: '晨跑 5 公里',
    notes: null,
    category_id: 'cat-4',
    priority: 'low',
    estimated_minutes: 40,
    due_at: iso(0, 8, 0),
    remind_at: null,
    is_completed: true,
    completed_at: iso(0, 7, 45),
    parent_task_id: null,
    event_id: null,
  },
];

export const mockDeadlines: Deadline[] = [
  {
    ...base(),
    id: 'dl-1',
    title: '课程论文提交',
    description: '提交至学习平台',
    due_at: iso(2, 23, 59),
    status: 'normal',
    custom_reminder_at: iso(1, 9, 0),
    category_id: 'cat-1',
    related_task_id: null,
    related_event_id: null,
  },
  {
    ...base(),
    id: 'dl-2',
    title: '实习申请表',
    description: null,
    due_at: iso(-1, 17, 0),
    status: 'overdue',
    custom_reminder_at: null,
    category_id: 'cat-2',
    related_task_id: null,
    related_event_id: null,
  },
  {
    ...base(),
    id: 'dl-3',
    title: '奖学金材料',
    description: null,
    due_at: iso(10, 23, 59),
    status: 'not_started',
    custom_reminder_at: null,
    category_id: 'cat-3',
    related_task_id: null,
    related_event_id: null,
  },
];

export const mockNotifications: AppNotification[] = [
  {
    ...base(),
    id: 'note-1',
    type: 'task_reminder',
    title: '任务提醒',
    body: '提交项目周报 将在 18:00 截止',
    payload: null,
    is_read: false,
    read_at: null,
    channel: 'in_app',
  },
  {
    ...base(),
    id: 'note-2',
    type: 'deadline_reminder',
    title: '截止日期提醒',
    body: '实习申请表 已逾期',
    payload: null,
    is_read: false,
    read_at: null,
    channel: 'in_app',
  },
];

export const mockImports: ImportRecord[] = [];

export const mockImportItems: ImportItem[] = [];

export const mockConversations: AiConversation[] = [];

export const mockActivityLogs: ActivityLog[] = [
  {
    ...base(),
    id: 'log-1',
    module: 'calendar',
    action: 'create',
    target_type: 'event',
    target_id: 'evt-1',
    detail: null,
  },
  {
    ...base(),
    id: 'log-2',
    module: 'tasks',
    action: 'complete',
    target_type: 'task',
    target_id: 'task-4',
    detail: null,
  },
];
