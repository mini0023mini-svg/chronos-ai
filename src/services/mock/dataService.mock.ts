import type { CrudRepo, Result } from '@/types/api';
import { ok, fail } from '@/types/api';
import { Errors, AppError } from '@/lib/errors';
import { makeId, safeJsonParse } from '@/lib/utils';
import { notifyDataChanged, type SyncScope } from '@/lib/syncBus';
import type { BaseEntity } from '@/types/models';
import type { IDataService } from '../interfaces';
import type { ImportSourceType } from '@/types/enums';
import {
  mockProfile,
  mockCategories,
  mockEvents,
  mockRecurringRules,
  mockTasks,
  mockDeadlines,
  mockNotifications,
  mockImports,
  mockImportItems,
  mockConversations,
  mockActivityLogs,
} from './seed';

/**
 * 演示模式仓储：模拟 Supabase 的查询、软删除行为，并用 localStorage 持久化，
 * 使「数据可保存」在无需后端的演示模式下同样成立。切换真实 Supabase 后此类不再使用。
 */
/** 表名 → 同步作用域：只有核心表触发 UI 刷新，其余归为 all */
const SYNC_SCOPE: Record<string, SyncScope> = {
  events: 'events',
  tasks: 'tasks',
  deadlines: 'deadlines',
  notifications: 'notifications',
};

function createRepo<T extends BaseEntity>(table: string, initial: T[]): CrudRepo<T> {
  const key = `chronos.mock.${table}`;
  const load = (): T[] => {
    const stored = safeJsonParse<T[] | null>(localStorage.getItem(key), null);
    return stored ?? initial.map((r) => ({ ...r }));
  };
  const save = (rows: T[]) => {
    try {
      localStorage.setItem(key, JSON.stringify(rows));
    } catch {
      /* 隐私模式或配额不足时退化为内存态，不影响当前会话 */
    }
    notifyDataChanged(SYNC_SCOPE[table] ?? 'all');
  };
  const alive = (rows: T[]) => rows.filter((r) => r.deleted_at === null);

  return {
    async list() {
      return ok(alive(load()).map((r) => ({ ...r })));
    },
    async listDeleted() {
      return ok(load().filter((r) => r.deleted_at !== null).map((r) => ({ ...r })));
    },
    async get(id: string) {
      const found = alive(load()).find((r) => r.id === id);
      return found ? ok({ ...found }) : fail<T>(Errors.notFound(id));
    },
    async create(input: Partial<T>) {
      const ts = new Date().toISOString();
      const row = {
        ...input,
        id: input.id ?? makeId(),
        user_id: input.user_id ?? mockProfile.user_id,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
        timezone: input.timezone ?? mockProfile.timezone,
      } as T;
      const rows = load();
      rows.push(row);
      save(rows);
      return ok({ ...row });
    },
    async update(id: string, patch: Partial<T>) {
      const rows = load();
      const idx = rows.findIndex((r) => r.id === id && r.deleted_at === null);
      if (idx < 0) return fail<T>(Errors.notFound(id));
      const updated = { ...rows[idx], ...patch, id, updated_at: new Date().toISOString() } as T;
      rows[idx] = updated;
      save(rows);
      return ok({ ...updated });
    },
    async remove(id: string) {
      const rows = load();
      const idx = rows.findIndex((r) => r.id === id && r.deleted_at === null);
      if (idx < 0) return fail<void>(Errors.notFound(id));
      rows[idx] = { ...rows[idx], deleted_at: new Date().toISOString() } as T;
      save(rows);
      return ok(undefined);
    },
    async restore(id: string) {
      const rows = load();
      const idx = rows.findIndex((r) => r.id === id && r.deleted_at !== null);
      if (idx < 0) return fail<void>(Errors.notFound(id));
      rows[idx] = { ...rows[idx], deleted_at: null, updated_at: new Date().toISOString() } as T;
      save(rows);
      return ok(undefined);
    },
  };
}

const PROFILE_KEY = 'chronos.mock.profile';
let profileState: typeof mockProfile = safeJsonParse(localStorage.getItem(PROFILE_KEY), null) ?? { ...mockProfile };

export const mockDataService: IDataService = {
  events: createRepo('events', mockEvents),
  tasks: createRepo('tasks', mockTasks),
  deadlines: createRepo('deadlines', mockDeadlines),
  categories: createRepo('categories', mockCategories),
  recurringRules: createRepo('recurring_rules', mockRecurringRules),
  notifications: createRepo('notifications', mockNotifications),
  importItems: createRepo('import_items', mockImportItems),
  conversations: createRepo('ai_conversations', mockConversations),
  imports: {
    ...createRepo('imports', mockImports),
    async upload(_file: File, _sourceType: ImportSourceType): Promise<Result<string>> {
      return fail<string>(new AppError('AI_UNAVAILABLE', 'Upload available after Phase 5'));
    },
  },
  activityLogs: {
    async list(): Promise<Result<typeof mockActivityLogs>> {
      const rows = safeJsonParse<typeof mockActivityLogs | null>(
        localStorage.getItem('chronos.mock.activity_logs'),
        null,
      ) ?? mockActivityLogs;
      return ok(rows.filter((l) => l.deleted_at === null).map((l) => ({ ...l })));
    },
    async create(input: Partial<typeof mockActivityLogs[number]>) {
      const key = 'chronos.mock.activity_logs';
      const rows = safeJsonParse<typeof mockActivityLogs | null>(localStorage.getItem(key), null)
        ?? mockActivityLogs.map((r) => ({ ...r }));
      const ts = new Date().toISOString();
      const row = {
        ...input,
        id: input.id ?? makeId(),
        user_id: input.user_id ?? mockProfile.user_id,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
        timezone: input.timezone ?? mockProfile.timezone,
      } as typeof mockActivityLogs[number];
      rows.unshift(row);
      try {
        localStorage.setItem(key, JSON.stringify(rows));
      } catch {
        /* ignore quota */
      }
      return ok({ ...row });
    },
  },
  profiles: {
    async get() {
      return ok({ ...profileState });
    },
    async update(patch) {
      profileState = { ...profileState, ...patch, updated_at: new Date().toISOString() };
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profileState));
      } catch {
        /* ignore */
      }
      return ok({ ...profileState });
    },
  },
};
