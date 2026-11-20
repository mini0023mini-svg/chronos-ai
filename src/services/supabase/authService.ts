import type { Session, AuthChangeEvent } from '@supabase/supabase-js';
import type { IAuthService } from '../interfaces';
import type { Session as AppSession } from '@/types/models';
import type { Result } from '@/types/api';
import { ok, fail } from '@/types/api';
import { Errors, AppError } from '@/lib/errors';
import { getSupabaseClient } from './client';

/** 把 Supabase Session 映射为应用层 Session（收敛外部类型，UI 不依赖 supabase-js 类型） */
function toAppSession(session: Session | null): AppSession | null {
  if (!session?.user) return null;
  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? '',
      display_name: (session.user.user_metadata?.display_name as string) ?? undefined,
    },
    access_token: session.access_token,
  };
}

function mapAuthError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid login credentials|email not confirmed/i.test(message)) {
    return Errors.auth(message);
  }
  if (/user already registered/i.test(message)) {
    return Errors.validation(message);
  }
  return new AppError('AUTH', message, error);
}

export const supabaseAuthService: IAuthService = {
  async getSession(): Promise<Result<AppSession | null>> {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) return fail(Errors.auth(error.message));
    return ok(toAppSession(data.session));
  },

  async signIn(email: string, password: string): Promise<Result<AppSession>> {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    if (error) return fail(mapAuthError(error));
    const session = toAppSession(data.session);
    if (!session) return fail(Errors.auth('Sign-in returned no session'));
    return ok(session);
  },

  async signUp(email: string, password: string, meta?: Record<string, unknown>): Promise<Result<AppSession>> {
    const { data, error } = await getSupabaseClient().auth.signUp({
      email,
      password,
      options: { data: meta },
    });
    if (error) return fail(mapAuthError(error));
    // 若开启了邮箱验证，session 可能为 null；此时注册本身成功，返回提示让用户去验证邮箱
    const session = toAppSession(data.session);
    if (!session) return fail(new AppError('AUTH', 'CHECK_EMAIL', data));
    return ok(session);
  },

  async signOut(): Promise<Result<void>> {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) return fail(Errors.auth(error.message));
    return ok(undefined);
  },

  onAuthStateChange(cb) {
    const { data } = getSupabaseClient().auth.onAuthStateChange(
      (_event: AuthChangeEvent, session) => cb(toAppSession(session)),
    );
    return () => data.subscription.unsubscribe();
  },
};
