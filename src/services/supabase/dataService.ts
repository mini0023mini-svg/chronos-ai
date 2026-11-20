import type { IDataService } from '../interfaces';
import type { CrudRepo, Result } from '@/types/api';
import { ok, fail } from '@/types/api';
import { Errors, AppError } from '@/lib/errors';
import type { BaseEntity } from '@/types/models';
import type { ImportSourceType } from '@/types/enums';
import { DEFAULT_TIMEZONE } from '@/lib/timezone';
import { notifyDataChanged, type SyncScope } from '@/lib/syncBus';
import { getSupabaseClient } from './client';

/** 表名 → 同步作用域 */
const SYNC_SCOPE: Record<string, SyncScope> = {
  events: 'events',
  tasks: 'tasks',
  deadlines: 'deadlines',
  notifications: 'notifications',
};
const broadcast = (table: string) => notifyDataChanged(SYNC_SCOPE[table] ?? 'all');

/** 把 Postgrest 错误统一映射为 AppError（含 PGRST116 未找到） */
function mapDbError(error: { message: string; code?: string }, fallback: string): AppError {
  if (error.code === 'PGRST116') return Errors.notFound(fallback);
  return new AppError('NETWORK', error.message, error);
}

/** 获取当前登录用户 id（RLS 已隔离，此处仅用于写入时填充 user_id 外键） */
async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabaseClient().auth.getUser();
  return data.user?.id ?? null;
}

/**
 * 通用仓储：所有查询叠加 .eq('user_id', uid).is('deleted_at', null)。
 * RLS 在数据库层强制隔离，前端过滤仅为双保险与软删除语义。
 */
function createRepo<T extends BaseEntity>(table: string): CrudRepo<T> {
  const db = () => getSupabaseClient().from(table);

  return {
    async list(): Promise<Result<T[]>> {
      const { data, error } = await db().select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) return fail(mapDbError(error, table));
      return ok((data ?? []) as T[]);
    },

    async listDeleted(): Promise<Result<T[]>> {
      const { data, error } = await db().select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
      if (error) return fail(mapDbError(error, table));
      return ok((data ?? []) as T[]);
    },

    async get(id: string): Promise<Result<T>> {
      const { data, error } = await db().select('*').eq('id', id).is('deleted_at', null).maybeSingle();
      if (error) return fail(mapDbError(error, id));
      if (!data) return fail(Errors.notFound(id));
      return ok(data as T);
    },

    async create(input: Partial<T>): Promise<Result<T>> {
      const uid = await currentUserId();
      if (!uid) return fail(Errors.auth());
      const payload = {
        ...input,
        user_id: uid,
        timezone: input.timezone ?? DEFAULT_TIMEZONE,
      };
      const { data, error } = await db().insert(payload as never).select().single();
      if (error) return fail(mapDbError(error, table));
      broadcast(table);
      return ok(data as T);
    },

    async update(id: string, patch: Partial<T>): Promise<Result<T>> {
      // 禁止客户端篡改 user_id 与 deleted_at（软删除走 remove/restore）
      const safe: Record<string, unknown> = { ...patch };
      delete safe.user_id;
      delete safe.deleted_at;
      delete safe.id;
      delete safe.created_at;
      const { data, error } = await db().update(safe as never).eq('id', id).is('deleted_at', null).select().single();
      if (error) return fail(mapDbError(error, id));
      broadcast(table);
      return ok(data as T);
    },

    async remove(id: string): Promise<Result<void>> {
      const { error } = await db()
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq('id', id)
        .is('deleted_at', null);
      if (error) return fail(mapDbError(error, id));
      broadcast(table);
      return ok(undefined);
    },

    async restore(id: string): Promise<Result<void>> {
      const { error } = await db()
        .update({ deleted_at: null } as never)
        .eq('id', id)
        .not('deleted_at', 'is', null);
      if (error) return fail(mapDbError(error, id));
      broadcast(table);
      return ok(undefined);
    },
  };
}

export const supabaseDataService: IDataService = {
  events: createRepo('events'),
  tasks: createRepo('tasks'),
  deadlines: createRepo('deadlines'),
  categories: createRepo('categories'),
  recurringRules: createRepo('recurring_rules'),
  notifications: createRepo('notifications'),
  importItems: createRepo('import_items'),
  conversations: createRepo('ai_conversations'),
  imports: {
    ...createRepo('imports'),
    async upload(file: File, sourceType: ImportSourceType): Promise<Result<string>> {
      const uid = await currentUserId();
      if (!uid) return fail(Errors.auth());
      const ext = file.name.split('.').pop() ?? sourceType;
      const path = `${uid}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error } = await getSupabaseClient().storage.from('imports').upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) return fail(new AppError('NETWORK', error.message, error));
      return ok(path);
    },
  },
  activityLogs: {
    async list(filters?: Record<string, unknown>) {
      let query = getSupabaseClient()
        .from('activity_logs')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (filters?.module) query = query.eq('module', filters.module as string);
      if (filters?.action) query = query.eq('action', filters.action as string);
      const { data, error } = await query;
      if (error) return fail(mapDbError(error, 'activity_logs'));
      return ok(data ?? []);
    },
    async create(input) {
      const uid = await currentUserId();
      if (!uid) return fail(Errors.auth());
      const { data, error } = await getSupabaseClient()
        .from('activity_logs')
        .insert({ ...input, user_id: uid })
        .select('*')
        .single();
      if (error) return fail(mapDbError(error, 'activity_logs'));
      return ok(data);
    },
  },
  profiles: {
    async get() {
      const uid = await currentUserId();
      if (!uid) return fail(Errors.auth());
      const { data, error } = await getSupabaseClient()
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();
      if (error) return fail(mapDbError(error, 'profiles'));
      if (!data) return fail(Errors.notFound('profiles'));
      return ok(data as import('@/types/models').Profile);
    },
    async update(patch) {
      const uid = await currentUserId();
      if (!uid) return fail(Errors.auth());
      const safe: Record<string, unknown> = { ...patch };
      delete safe.id;
      delete safe.user_id;
      delete safe.created_at;
      delete safe.deleted_at;
      const { data, error } = await getSupabaseClient()
        .from('profiles')
        .update(safe as never)
        .eq('id', uid)
        .select()
        .single();
      if (error) return fail(mapDbError(error, 'profiles'));
      return ok(data as import('@/types/models').Profile);
    },
  },
};
