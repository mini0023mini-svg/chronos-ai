import type { IAuthService } from '../interfaces';
import type { Result } from '@/types/api';
import { ok, fail } from '@/types/api';
import { Errors } from '@/lib/errors';
import type { Session } from '@/types/models';
import { MOCK_USER_ID } from './seed';

const listeners = new Set<(s: Session | null) => void>();

const demoSession: Session = {
  user: { id: MOCK_USER_ID, email: 'demo@chronos.ai', display_name: 'Demo User' },
  access_token: 'mock-token',
};

/** Phase 1 认证占位：始终回传一个演示会话；Phase 2 由 Supabase Auth 替换 */
export const mockAuthService: IAuthService = {
  async getSession(): Promise<Result<Session | null>> {
    return ok(demoSession);
  },
  async signIn(email: string, password: string): Promise<Result<Session>> {
    if (!email || !password) return fail(Errors.validation('Email and password are required'));
    listeners.forEach((cb) => cb(demoSession));
    return ok(demoSession);
  },
  async signUp(email: string, _password: string): Promise<Result<Session>> {
    if (!email) return fail(Errors.validation('Email is required'));
    listeners.forEach((cb) => cb(demoSession));
    return ok(demoSession);
  },
  async signOut(): Promise<Result<void>> {
    listeners.forEach((cb) => cb(null));
    return ok(undefined);
  },
  onAuthStateChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};
