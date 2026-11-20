import type {
  ActionType,
  DeadlineStatus,
  ImportSourceType,
  ImportStatus,
  ModuleKey,
  NotificationChannel,
  Priority,
  RecurrenceFreq,
} from './enums';

/** 所有数据库实体共有的基础字段 */
export interface BaseEntity {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  timezone: string;
}

export interface Profile extends BaseEntity {
  display_name: string | null;
  avatar_url: string | null;
  language: 'zh-CN' | 'en-US';
  theme: 'light' | 'dark' | 'system';
}

export interface Category extends BaseEntity {
  name: string;
  color: string;
  icon: string | null;
  is_default: boolean;
  sort_order: number;
}

export interface RecurringRule extends BaseEntity {
  title: string;
  freq: RecurrenceFreq;
  interval: number;
  by_weekday: number[] | null;
  by_month_day: number | null;
  start_date: string;
  end_date: string | null;
  count: number | null;
  superseded_by: string | null;
}

export interface CalendarEvent extends BaseEntity {
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  category_id: string | null;
  calendar_key: string;
  recurrence_rule_id: string | null;
  original_event_id: string | null;
  is_exception: boolean;
  is_cancelled: boolean;
  occurrence_date: string | null;
}

export interface Task extends BaseEntity {
  title: string;
  notes: string | null;
  category_id: string | null;
  priority: Priority;
  estimated_minutes: number | null;
  due_at: string | null;
  remind_at: string | null;
  is_completed: boolean;
  completed_at: string | null;
  parent_task_id: string | null;
  event_id: string | null;
}

export interface Deadline extends BaseEntity {
  title: string;
  description: string | null;
  due_at: string;
  status: DeadlineStatus;
  custom_reminder_at: string | null;
  category_id: string | null;
  related_task_id: string | null;
  related_event_id: string | null;
}

export interface ImportRecord extends BaseEntity {
  source_type: ImportSourceType;
  file_path: string | null;
  raw_text: string | null;
  status: ImportStatus;
}

export interface ImportItem extends BaseEntity {
  import_id: string;
  item_type: 'event' | 'task' | 'deadline';
  payload: Record<string, unknown>;
  confidence: number | null;
  needs_confirm: boolean;
  is_duplicate: boolean;
  has_conflict: boolean;
  missing_date: boolean;
  confirmed: boolean;
  target_id: string | null;
}

export interface AppNotification extends BaseEntity {
  type: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  channel: NotificationChannel;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: string;
  /** AI/本地助手生成的待确认操作（仅 assistant 消息），确认闸门随会话持久化 */
  pendingActions?: PendingAction[];
  /** 回复来源：AI 网关 / 本地规则引擎 */
  source?: 'ai' | 'local';
  /** 该消息的待确认操作是否已处理（确认或忽略） */
  resolved?: boolean;
}

export interface AiConversation extends BaseEntity {
  title: string | null;
  messages: ChatMessage[];
  pending_actions: PendingAction[];
  status: 'active' | 'archived';
}

/** AI 生成后等待用户确认的操作（确认闸门核心类型） */
export interface PendingAction {
  id: string;
  kind: 'create_event' | 'update_event' | 'create_task' | 'update_task' | 'create_deadline';
  payload: Record<string, unknown>;
  description: string;
  conflicts: string[];
}

export interface ActivityLog extends BaseEntity {
  module: ModuleKey;
  action: ActionType;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown> | null;
}

/** 会话（Phase 2 接入 Supabase Auth 后替换） */
export interface Session {
  user: {
    id: string;
    email: string;
    display_name?: string;
  };
  access_token: string;
}
