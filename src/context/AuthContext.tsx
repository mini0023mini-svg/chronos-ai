import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@/types/models';
import type { Result } from '@/types/api';
import { authService } from '@/services';

interface AuthContextValue {
  session: Session | null;
  user: Session['user'] | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<Result<Session>>;
  signUp: (email: string, password: string, meta?: Record<string, unknown>) => Promise<Result<Session>>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    authService
      .getSession()
      .then((result) => {
        if (!active) return;
        setSession(result.ok ? result.data : null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const unsubscribe = authService.onAuthStateChange((next) => {
      if (active) setSession(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authService.signIn(email, password);
    if (result.ok) setSession(result.data);
    return result;
  }, []);

  const signUp = useCallback(async (email: string, password: string, meta?: Record<string, unknown>) => {
    const result = await authService.signUp(email, password, meta);
    if (result.ok) setSession(result.data);
    return result;
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isAuthenticated: Boolean(session),
      signIn,
      signUp,
      signOut,
    }),
    [session, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
