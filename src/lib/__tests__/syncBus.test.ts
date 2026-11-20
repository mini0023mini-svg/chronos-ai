import { describe, it, expect, beforeAll, vi } from 'vitest';

/**
 * syncBus 依赖 window/localStorage/BroadcastChannel。
 * 在导入模块前用 stub 注入最小浏览器 API（node 环境），确保三通道逻辑可测。
 */
type Listener = (event: { detail?: unknown; key?: string | null; newValue?: string | null }) => void;

const windowListeners = new Map<string, Set<Listener>>();
const store = new Map<string, string>();

const fakeWindow = {
  addEventListener: (type: string, fn: Listener) => {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set());
    windowListeners.get(type)!.add(fn);
  },
  removeEventListener: (type: string, fn: Listener) => {
    windowListeners.get(type)?.delete(fn);
  },
  dispatchEvent: (event: { type: string; detail?: unknown }) => {
    windowListeners.get(event.type)?.forEach((fn) => fn(event));
    return true;
  },
};

beforeAll(async () => {
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('BroadcastChannel', class {
    addEventListener() {}
    removeEventListener() {}
    postMessage() {}
  });
  vi.stubGlobal('CustomEvent', class {
    constructor(public type: string, public init: { detail?: unknown }) {}
    get detail() { return this.init.detail; }
  });
});

describe('syncBus', () => {
  it('notifyDataChanged 触发本标签页订阅者', async () => {
    const { notifyDataChanged, subscribeDataChanged } = await import('@/lib/syncBus');
    const received: string[] = [];
    const unsub = subscribeDataChanged((msg) => received.push(msg.scope));
    notifyDataChanged('events');
    expect(received).toContain('events');
    unsub();
  });

  it('取消订阅后不再收到通知', async () => {
    const { notifyDataChanged, subscribeDataChanged } = await import('@/lib/syncBus');
    let count = 0;
    const unsub = subscribeDataChanged(() => { count += 1; });
    unsub();
    notifyDataChanged('tasks');
    expect(count).toBe(0);
  });

  it('storage 事件中的自身 origin 被忽略，跨标签页 origin 被接受', async () => {
    const { subscribeDataChanged, SYNC_TAB_ID } = await import('@/lib/syncBus');
    const received: string[] = [];
    const unsub = subscribeDataChanged((msg) => received.push(msg.scope));

    const storageFns = windowListeners.get('storage') ?? [];
    const fire = (origin: string, scope: string) => {
      const newValue = JSON.stringify({ scope, ts: Date.now(), origin });
      storageFns.forEach((fn) => fn({ key: 'chronos:sync-signal', newValue }));
    };

    fire(SYNC_TAB_ID, 'deadlines'); // 自身广播：忽略
    expect(received).toHaveLength(0);
    fire('other-tab', 'notifications'); // 跨标签页：接受
    expect(received).toEqual(['notifications']);
    unsub();
  });

  it('损坏的 storage 信号不会抛错', async () => {
    const { subscribeDataChanged } = await import('@/lib/syncBus');
    const unsub = subscribeDataChanged(() => {});
    const storageFns = windowListeners.get('storage') ?? [];
    expect(() => storageFns.forEach((fn) => fn({ key: 'chronos:sync-signal', newValue: '{bad json' }))).not.toThrow();
    unsub();
  });
});
