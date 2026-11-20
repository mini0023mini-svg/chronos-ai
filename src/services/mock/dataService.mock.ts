import type { CrudRepo, Result } from '@/types/api';
import { ok, fail } from '@/types/api';
import { Errors, AppError } from '@/lib/errors';
import { makeId, safeJsonParse } from '@/lib/utils';
import { notifyDataChanged, type SyncScope } from '@/lib/syncBus';
import type { BaseEntity, CalendarEvent } from '@/types/models';
import { DEFAULT_TIMEZONE, formatInZone, fromZoneTime, isValidTimeZone } from '@/lib/timezone';
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

/**
 * 一次性迁移：清除旧版演示种子中的「高等数学」课程已写入 localStorage 的数据。
 * 背景：用户导入真实课表时，仓储会先以 seed 为底再 save，导致该课程被固化到浏览器；
 * 仅改 seed 不足以让它消失，故这里按 id 精确剔除事件与重复规则，且只执行一次。
 */
const MATH_PURGE_KEY = 'chronos.mock.purgeMath.v1';
function purgeLegacyMath(): void {
  try {
    if (localStorage.getItem(MATH_PURGE_KEY)) return;
    const strip = (key: string, isMath: (row: { id?: string; title?: string }) => boolean) => {
      const rows = safeJsonParse<Array<{ id?: string; title?: string }> | null>(localStorage.getItem(key), null);
      if (!rows) return;
      const kept = rows.filter((row) => !isMath(row));
      if (kept.length !== rows.length) localStorage.setItem(key, JSON.stringify(kept));
    };
    strip('chronos.mock.events', (r) => r.title === '高等数学' || (r.id ?? '').startsWith('evt-math'));
    strip('chronos.mock.recurring_rules', (r) => r.title === '高等数学' || r.id === 'rule-1');
    localStorage.setItem(MATH_PURGE_KEY, '1');
  } catch {
    /* localStorage 不可用时跳过，不影响当前会话 */
  }
}
purgeLegacyMath();

/**
 * 一次性迁移：用户要求「大学语文」统一为 14:00-15:25（对应第 5-6 节）。
 * 旧课表按 3-6 节导入（10:10 起），已固化的事件按事件自带时区重建起止时刻，只执行一次。
 */
const CHINESE_TIME_KEY = 'chronos.mock.fixChineseTime.v1';
function fixChineseClassTime(): void {
  try {
    if (localStorage.getItem(CHINESE_TIME_KEY)) return;
    const key = 'chronos.mock.events';
    const rows = safeJsonParse<CalendarEvent[] | null>(localStorage.getItem(key), null);
    if (rows) {
      const updated = rows.map((row) => {
        if (row.title !== '大学语文' && !row.title?.startsWith('大学语文（')) return row;
        const tz = isValidTimeZone(row.timezone) ? row.timezone : DEFAULT_TIMEZONE;
        const date = formatInZone(row.start_at, 'yyyy-MM-dd', tz);
        const startAt = fromZoneTime(`${date}T14:00:00`, tz).toISOString();
        const endAt = fromZoneTime(`${date}T15:25:00`, tz).toISOString();
        if (row.start_at === startAt && row.end_at === endAt) return row;
        return { ...row, start_at: startAt, end_at: endAt, updated_at: new Date().toISOString() };
      });
      const changed = updated.some((row, i) => row !== rows[i]);
      if (changed) localStorage.setItem(key, JSON.stringify(updated));
    }
    localStorage.setItem(CHINESE_TIME_KEY, '1');
  } catch {
    /* localStorage 不可用时跳过，不影响当前会话 */
  }
}
fixChineseClassTime();

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
