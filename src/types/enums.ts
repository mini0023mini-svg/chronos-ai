/** 界面语言 */
export type Locale = 'zh-CN' | 'en-US';

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system';

/** 任务分类（与 categories 表默认 6 项对应） */
export type TaskCategory = 'Study' | 'Work' | 'Personal' | 'Exercise' | 'Life' | 'Other';

/** 任务优先级 */
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

/** 重复频率 */
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** 截止日期状态（决定颜色：蓝/绿/黄/红/灰） */
export type DeadlineStatus = 'not_started' | 'normal' | 'soon' | 'overdue' | 'finished';

/** 导入来源类型 */
export type ImportSourceType = 'jpg' | 'png' | 'pdf' | 'docx' | 'xlsx' | 'txt' | 'paste';

/** 导入批次状态 */
export type ImportStatus = 'pending' | 'preview' | 'confirmed' | 'failed';

/** 通知渠道 */
export type NotificationChannel = 'in_app' | 'system' | 'push';

/** 模块标识（用于 activity_logs 筛选） */
export type ModuleKey =
  | 'dashboard'
  | 'calendar'
  | 'tasks'
  | 'ai_assistant'
  | 'ai_import'
  | 'deadlines'
  | 'smart_planning'
  | 'notifications'
  | 'history'
  | 'settings';

/** 操作类型（用于 activity_logs 筛选） */
export type ActionType = 'create' | 'update' | 'delete' | 'restore' | 'confirm' | 'complete' | 'import';
