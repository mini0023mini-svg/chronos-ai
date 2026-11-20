import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { startRealtimeSync, type RealtimeStatus } from '@/services/realtimeService';
import { hasSupabaseConfig } from '@/services/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface SyncContextValue {
  /** Realtime 订阅状态 */
  status: RealtimeStatus;
  /** 是否配置了云端（决定是 Realtime 还是本地跨标签页同步） */
  cloudEnabled: boolean;
  /** 最近一次收到变更信号的时间戳 */
  lastSyncAt: number | null;
}

const SyncContext = createContext<SyncContextValue | null>(null);

/** 全局同步状态：登录后启动 Realtime 订阅，退出后停止 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const cloudEnabled = hasSupabaseConfig;
  const [status, setStatus] = useState<RealtimeStatus>(cloudEnabled ? 'connecting' : 'disabled');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !cloudEnabled) {
      setStatus('disabled');
      return;
    }
    const handle = startRealtimeSync(setStatus);
    return () => handle.stop();
  }, [isAuthenticated, cloudEnabled]);

  useEffect(() => {
    // 订阅总线的最后同步时间，供设置页展示（动态 import 避免循环依赖）
    let unsubscribe = () => {};
    void import('@/lib/syncBus').then(({ subscribeDataChanged }) => {
      unsubscribe = subscribeDataChanged(() => setLastSyncAt(Date.now()));
    });
    return () => unsubscribe();
  }, []);

  const value = useMemo<SyncContextValue>(
    () => ({ status, cloudEnabled, lastSyncAt }),
    [status, cloudEnabled, lastSyncAt],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
