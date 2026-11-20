import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase 客户端封装 —— 前端唯一的 anon key 使用点。
 * 安全约束：
 *   - 只使用 VITE_SUPABASE_ANON_KEY（公开 key，受 RLS 保护）
 *   - 绝不引入 Service Role Key
 *   - RLS 策略在数据库层按 auth.uid() 隔离数据，前端无需也不应信任客户端过滤
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** 是否具备连接真实 Supabase 的完整配置 */
export const hasSupabaseConfig = Boolean(
  url && anonKey && url.startsWith('http') && !url.includes('your-project'),
);

let client: SupabaseClient | null = null;

/** 获取 Supabase 客户端；配置缺失时抛错，由服务容器降级到 mock 前拦截 */
export function getSupabaseClient(): SupabaseClient {
  if (!hasSupabaseConfig) {
    throw new Error('Supabase is not configured. Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
  }
  if (!client) {
    client = createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/** 供服务层安全获取客户端；无配置返回 null 以便降级 */
export function tryGetSupabaseClient(): SupabaseClient | null {
  return hasSupabaseConfig ? getSupabaseClient() : null;
}
