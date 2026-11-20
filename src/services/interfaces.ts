import type { Result, CrudRepo, AiContext, AiReply, PlanDraft } from '@/types/api';
import type { PendingAction, Session } from '@/types/models';
import type { ImportSourceType } from '@/types/enums';

/** 认证服务接口（Phase 2 由 Supabase Auth 实现） */
export interface IAuthService {
  getSession(): Promise<Result<Session | null>>;
  signIn(email: string, password: string): Promise<Result<Session>>;
  signUp(email: string, password: string, meta?: Record<string, unknown>): Promise<Result<Session>>;
  signOut(): Promise<Result<void>>;
  onAuthStateChange(cb: (session: Session | null) => void): () => void;
}

/** 数据服务接口（Phase 2 由 Supabase 实现；UI 只依赖此接口） */
export interface IDataService {
  events: CrudRepo<import('@/types/models').CalendarEvent>;
  tasks: CrudRepo<import('@/types/models').Task>;
  deadlines: CrudRepo<import('@/types/models').Deadline>;
  categories: CrudRepo<import('@/types/models').Category>;
  recurringRules: CrudRepo<import('@/types/models').RecurringRule>;
  notifications: CrudRepo<import('@/types/models').AppNotification>;
  importItems: CrudRepo<import('@/types/models').ImportItem>;
  conversations: CrudRepo<import('@/types/models').AiConversation>;
  imports: CrudRepo<import('@/types/models').ImportRecord> & {
    upload(file: File, sourceType: ImportSourceType): Promise<Result<string>>;
  };
  activityLogs: {
    list(filters?: Record<string, unknown>): Promise<Result<import('@/types/models').ActivityLog[]>>;
    /** 新增操作日志（Phase 6 AI 确认写入用）；实现缺失时静默跳过 */
    create?(input: Partial<import('@/types/models').ActivityLog>): Promise<Result<import('@/types/models').ActivityLog>>;
  };
  profiles: {
    get(): Promise<Result<import('@/types/models').Profile>>;
    update(patch: Partial<import('@/types/models').Profile>): Promise<Result<import('@/types/models').Profile>>;
  };
}

/** AI 服务接口（Phase 5+ 由 Edge Function / Vercel Serverless 实现） */
export interface IAIService {
  chat(message: string, ctx: AiContext): Promise<Result<AiReply>>;
  importParse(input: File | string): Promise<Result<PendingAction[]>>;
  planDay(ctx: AiContext): Promise<Result<PlanDraft>>;
  reschedule(ctx: AiContext): Promise<Result<PlanDraft>>;
  confirm(actions: PendingAction[]): Promise<Result<void>>;
  isAvailable(): boolean;
}
