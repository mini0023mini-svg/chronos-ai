/**
 * 数据变更事件总线 —— 实时同步基础设施。
 * 设计目标：
 *   1. 进程内通知：任何写操作 emit 后，所有挂载的 useAsync 静默重载；
 *   2. 跨标签页同步：BroadcastChannel 广播，localStorage storage 事件作为降级；
 *   3. 与 Supabase Realtime 共用同一通道（realtime 收到远端变更也走 emit）。
 * 安全约束：总线只传「哪个表变了」的信号，不传任何业务数据，避免 RLS 数据外泄。
 */

export type SyncScope = 'events' | 'tasks' | 'deadlines' | 'notifications' | 'all';

export interface SyncMessage {
  scope: SyncScope;
  ts: number;
  origin: string;
}

const CUSTOM_EVENT = 'chronos:sync';
const BC_NAME = 'chronos-sync';
const LS_SIGNAL = 'chronos:sync-signal';
const TAB_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) channel = new BroadcastChannel(BC_NAME);
  return channel;
}

function buildMessage(scope: SyncScope): SyncMessage {
  return { scope, ts: Date.now(), origin: TAB_ID };
}

/** 广播一次数据变更（本地写操作 / realtime 远端变更都调用它） */
export function notifyDataChanged(scope: SyncScope = 'all'): void {
  const msg = buildMessage(scope);
  try {
    window.dispatchEvent(new CustomEvent<SyncMessage>(CUSTOM_EVENT, { detail: msg }));
  } catch {
    /* SSR / 无 window 环境 */
  }
  try {
    getChannel()?.postMessage(msg);
  } catch {
    /* 部分浏览器禁用 BroadcastChannel */
  }
  try {
    localStorage.setItem(LS_SIGNAL, JSON.stringify(msg));
  } catch {
    /* 隐私模式 / 配额不足时降级为仅进程内通知 */
  }
}

/** 订阅数据变更；同一标签页与跨标签页的信号都会收到 */
export function subscribeDataChanged(listener: (msg: SyncMessage) => void): () => void {
  const onCustom = (event: Event) => listener((event as CustomEvent<SyncMessage>).detail);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== LS_SIGNAL || !event.newValue) return;
    try {
      const msg = JSON.parse(event.newValue) as SyncMessage;
      if (msg.origin !== TAB_ID) listener(msg);
    } catch {
      /* 忽略损坏的信号 */
    }
  };
  const bc = getChannel();
  const onBroadcast = (event: MessageEvent<SyncMessage>) => {
    if (event.data && event.data.origin !== TAB_ID) listener(event.data);
  };

  window.addEventListener(CUSTOM_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  bc?.addEventListener('message', onBroadcast);

  return () => {
    window.removeEventListener(CUSTOM_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
    bc?.removeEventListener('message', onBroadcast);
  };
}

/** 当前标签页标识，用于区分自身广播与远端广播 */
export const SYNC_TAB_ID = TAB_ID;
