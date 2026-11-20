import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock3, ShieldCheck, AlertCircle, Languages } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useErrorText } from '@/hooks/useErrorText';
import { useTheme } from '@/hooks/useTheme';
import { useMock } from '@/services';

type Mode = 'signIn' | 'signUp';

export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const errorText = useErrorText();
  const { resolvedTheme, toggle } = useTheme();
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = mode === 'signIn' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (result.ok) {
      navigate('/', { replace: true });
    } else if (result.error.code === 'AUTH' && result.error.message === 'CHECK_EMAIL') {
      setNotice(t('login.checkEmail'));
    } else {
      setError(errorText(result.error));
    }
  };

  const demoLogin = async () => {
    setError(null);
    setBusy(true);
    const result = await signIn('demo@chronos.ai', 'demo');
    setBusy(false);
    if (result.ok) navigate('/', { replace: true });
    else setError(errorText(result.error));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="absolute right-4 top-4 flex gap-2">
        <button
          type="button"
          onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}
          className="flex h-9 items-center gap-1.5 rounded-xl border bg-card px-2.5 text-xs text-muted"
          style={{ borderColor: 'var(--border)' }}
          aria-label={t('header.language')}
        >
          <Languages className="h-4 w-4" /> {locale === 'zh-CN' ? '中' : 'EN'}
        </button>
        <button
          type="button"
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-xl border bg-card text-xs text-muted"
          style={{ borderColor: 'var(--border)' }}
          aria-label={t('header.theme')}
        >
          {resolvedTheme === 'dark' ? '☾' : '☀'}
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-soft">
            <Clock3 className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('login.title')}</h1>
          <p className="mt-2 text-sm text-muted">{t('login.subtitle')}</p>
        </div>

        <div className="surface-card p-6 sm:p-8">
          <div className="mb-6 flex rounded-xl bg-black/5 p-1 dark:bg-white/5">
            {(['signIn', 'signUp'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); setNotice(null); }}
                className={`flex-1 rounded-lg py-2 text-sm transition ${mode === m ? 'bg-card font-medium text-ink shadow-sm' : 'text-muted'}`}
              >
                {t(m === 'signIn' ? 'login.tab.signIn' : 'login.tab.signUp')}
              </button>
            ))}
          </div>

          {notice && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-primary/40 bg-primary/10 p-3 text-xs text-ink">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              {notice}
            </div>
          )}
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <Input
              label={t('login.email')}
              type="email"
              autoComplete="email"
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label={t('login.password')}
              type="password"
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              placeholder={t('login.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <Button variant="primary" type="submit" className="w-full" disabled={busy || !email || password.length < 6}>
              {busy ? t('login.loading') : t(mode === 'signIn' ? 'login.signIn' : 'login.signUp')}
            </Button>
          </form>

          {useMock && (
            <>
              <div className="my-5 flex items-center gap-3 text-[11px] text-muted">
                <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
                OR
                <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
              </div>
              <Button className="w-full" onClick={demoLogin} disabled={busy}>
                {t('login.demo')}
              </Button>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">{t('login.demoHint')}</p>
            </>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {t('login.secureHint')}
        </p>
      </div>
    </div>
  );
}
