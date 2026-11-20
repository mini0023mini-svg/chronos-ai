import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dataService } from '@/services';
import { DEFAULT_TIMEZONE, isValidTimeZone } from '@/lib/timezone';

interface PreferencesContextValue {
  timezone: string;
  setTimezone: (tz: string) => Promise<void>;
  loading: boolean;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);
const TZ_CACHE_KEY = 'chronos.timezone';

function cachedTimezone(): string {
  try {
    const value = localStorage.getItem(TZ_CACHE_KEY);
    if (value && isValidTimeZone(value)) return value;
  } catch {
    /* ignore */
  }
  return DEFAULT_TIMEZONE;
}

/** 全局偏好：时区从 profiles 加载，写入后全应用即时生效 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezoneState] = useState<string>(cachedTimezone);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    dataService.profiles
      .get()
      .then((result) => {
        if (!active || !result.ok) return;
        const tz = result.data.timezone;
        if (tz && isValidTimeZone(tz)) {
          setTimezoneState(tz);
          try {
            localStorage.setItem(TZ_CACHE_KEY, tz);
          } catch {
            /* ignore */
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const setTimezone = useCallback(async (tz: string) => {
    if (!isValidTimeZone(tz)) return;
    // 乐观更新：界面立即生效
    setTimezoneState(tz);
    try {
      localStorage.setItem(TZ_CACHE_KEY, tz);
    } catch {
      /* ignore */
    }
    await dataService.profiles.update({ timezone: tz });
  }, []);

  const value = useMemo(() => ({ timezone, setTimezone, loading }), [timezone, setTimezone, loading]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
