import { useCallback, useEffect, useRef, useState } from 'react';
import type { Result } from '@/types/api';
import type { AsyncState } from '@/types/api';
import { AppError } from '@/lib/errors';

/**
 * 统一异步三态：自动执行 loader 并维护 loading/data/error。
 * deps 变化时重新拉取；组件卸载后忽略迟到的结果。
 */
export function useAsync<T>(loader: () => Promise<Result<T>>, deps: unknown[] = []): AsyncState<T> & { reload: () => void; refresh: () => void; silent: boolean } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);
  const [silent, setSilent] = useState(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  /** 完整重载：显示 loading 骨架 */
  const reload = useCallback(() => {
    setSilent(false);
    setNonce((n) => n + 1);
  }, []);

  /** 静默重载：保留现有数据，仅后台刷新（实时同步用，避免闪烁） */
  const refresh = useCallback(() => {
    setSilent(true);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    // 静默重载保留旧数据，避免实时同步时界面闪烁
    setState((prev) => (silent && prev.data !== null ? prev : { data: null, loading: true, error: null }));
    loaderRef.current()
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setState({ data: result.data, loading: false, error: null });
        } else {
          setState({ data: null, loading: false, error: result.error });
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setState({ data: null, loading: false, error: AppError.unknown(err) });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { ...state, reload, refresh, silent };
}
