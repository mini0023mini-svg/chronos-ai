import type { AppError } from '@/lib/errors';

/** 统一服务层返回类型：成功或失败，杜绝隐式异常 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail<T>(error: AppError): Result<T> {
  return { ok: false, error };
}

/** 通用 CRUD 仓储接口；remove 为软删除，restore 为恢复 */
export interface CrudRepo<T> {
  list(): Promise<Result<T[]>>;
  /** 列出软删除的记录（用于恢复中心）；listDeleted 为 Phase 4 新增，实现缺失时返回空 */
  listDeleted?(): Promise<Result<T[]>>;
  get(id: string): Promise<Result<T>>;
  create(input: Partial<T>): Promise<Result<T>>;
  update(id: string, patch: Partial<T>): Promise<Result<T>>;
  remove(id: string): Promise<Result<void>>;
  restore(id: string): Promise<Result<void>>;
}

/** AI 上下文快照：供 Assistant / Planner 读取用户当前安排 */
export interface AiContext {
  timezone: string;
  date: string;
  events: import('./models').CalendarEvent[];
  tasks: import('./models').Task[];
  deadlines: import('./models').Deadline[];
}

/** AI 规划草案：包含待确认操作，绝不直接写入 */
export interface PlanDraft {
  summary: string;
  actions: import('./models').PendingAction[];
  conflicts: string[];
}

/** AI 回复 */
export interface AiReply {
  message: string;
  pendingActions: import('./models').PendingAction[];
}

/** 异步数据三态 */
export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: AppError | null;
}
