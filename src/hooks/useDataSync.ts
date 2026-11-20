import { useEffect, useRef } from 'react';
import { subscribeDataChanged, type SyncMessage, type SyncScope } from '@/lib/syncBus';

/**
 * 订阅数据变更总线并触发一个或多个静默重载。
 * @param scope 关心的变更范围；all 接收全部
 * @param refresh 单个或数组：由 useAsync 返回的静默重载函数
 * @param enabled 是否启用（卸载页面可传 false）
 *
 * 变更信号做 150ms 防抖：批量写入（如重复事件物化）只触发一次刷新。
 */
export function useDataSync(
  scope: SyncScope,
  refresh: (() => void) | Array<() => void>,
  enabled = true,
): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const shouldReload = (msg: SyncMessage) => scope === 'all' || msg.scope === 'all' || msg.scope === scope;
    const runRefresh = () => {
      const fns = Array.isArray(refreshRef.current) ? refreshRef.current : [refreshRef.current];
      fns.forEach((fn) => fn());
    };

    const unsubscribe = subscribeDataChanged((msg) => {
      if (!shouldReload(msg)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(runRefresh, 150);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [scope, enabled]);
}
