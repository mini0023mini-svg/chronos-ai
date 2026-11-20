import { Languages, Moon, Sun, Monitor, LogOut } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import type { Locale, ThemeMode } from '@/types/enums';
import { cn } from '@/lib/utils';

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;
const themeOrder: ThemeMode[] = ['light', 'dark', 'system'];

export function TopBar() {
  const { locale, setLocale, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const ThemeIcon = themeIcons[theme];

  const cycleTheme = () => {
    const idx = themeOrder.indexOf(theme);
    setTheme(themeOrder[(idx + 1) % themeOrder.length]);
  };

  const toggleLocale = () => setLocale((locale === 'zh-CN' ? 'en-US' : 'zh-CN') as Locale);

  return (
    <div className="sticky top-0 z-30 flex h-[64px] items-center justify-between gap-3 border-b bg-canvas/85 px-4 backdrop-blur sm:px-6" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 md:hidden">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
          <ClockMark />
        </span>
        <span className="text-sm font-semibold text-ink">CHRONOS AI</span>
      </div>

      <div className="hidden text-sm text-muted md:block">
        {user?.display_name ? `${t('dashboard.greeting')}, ${user.display_name}` : t('dashboard.greeting')}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggleLocale}
          className="flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs text-muted transition hover:text-ink"
          style={{ borderColor: 'var(--border)' }}
          aria-label={t('header.language')}
          title={t('header.language')}
        >
          <Languages className="h-4 w-4" aria-hidden />
          <span className={cn('font-medium')}>{locale === 'zh-CN' ? '中' : 'EN'}</span>
        </button>
        <button
          type="button"
          onClick={cycleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-xl border text-muted transition hover:text-ink"
          style={{ borderColor: 'var(--border)' }}
          aria-label={t('header.theme')}
          title={theme}
        >
          <ThemeIcon className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs text-muted transition hover:text-danger"
          style={{ borderColor: 'var(--border)' }}
          aria-label={t('header.signOut')}
          title={user?.email ?? t('header.signOut')}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{t('header.signOut')}</span>
        </button>
      </div>
    </div>
  );
}

function ClockMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
