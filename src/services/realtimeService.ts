/**
 * 实时同步服务 —— 订阅 Supabase Realtime 的 postgres_changes。
 * 设计原则：
 *   - 仅在当前用户已配置 Supabase 时启用；演示模式依赖 syncBus 的跨标签页广播；
 *   - RLS 同样作用于 Realtime（用户只收到自己的行变更）；
 *   - 远端变更与本地写操作共用 notifyDataChanged 通道，UI 只需订阅一个总线；
 *   - 连接失败静默降级，不影响离线 / 演示使用。
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { tryGetSupabaseClient, hasSupabaseConfig } from './supabase/client';
import { notifyDataChanged, type SyncScope } from '@/lib/syncBus';

/** 需要订阅的核心表（与 UI 刷新相关） */
const WATCHED_TABLES: Array<{ table: string; scope: SyncScope }> = [
  { table: 'events', scope: 'events' },
  { table: 'tasks', scope: 'tasks' },
  { table: 'deadlines', scope: 'deadlines' },
  { table: 'notifications', scope: 'notifications' },
];

export type RealtimeStatus = 'disabled' | 'connecting' | 'subscribed' | 'error';

interface RealtimeHandle {
  stop: () => void;
  getStatus: () => RealtimeStatus;
}

/**
 * 启动 Realtime 订阅。
 * @returns handle：stop() 取消订阅；getStatus() 供设置页展示状态。
 */
export function startRealtimeSync(onStatus?: (status: RealtimeStatus) => void): RealtimeHandle {
  if (!hasSupabaseConfig) {
    onStatus?.('disabled');
    return { stop: () => {}, getStatus: () => 'disabled' };
  }

  const client = tryGetSupabaseClient();
  if (!client) {
    onStatus?.('disabled');
    return { stop: () => {}, getStatus: () => 'disabled' };
  }

  let status: RealtimeStatus = 'connecting';
  onStatus?.(status);
  const setStatus = (next: RealtimeStatus) => {
    status = next;
    onStatus?.(next);
  };

  let channel: RealtimeChannel = client.channel('chronos-data-sync');
  for (const { table, scope } of WATCHED_TABLES) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => notifyDataChanged(scope),
    );
  }
  channel = channel.subscribe((channelStatus) => {
      if (channelStatus === 'SUBSCRIBED') setStatus('subscribed');
      else if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') setStatus('error');
      else if (channelStatus === 'CLOSED') setStatus('disabled');
    });

  return {
    stop: () => {
      void client.removeChannel(channel);
      setStatus('disabled');
    },
    getStatus: () => status,
  };
}
