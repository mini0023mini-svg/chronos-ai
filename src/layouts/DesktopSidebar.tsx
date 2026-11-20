import { NavLink } from 'react-router-dom';
import { Clock3, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { NAV_ITEMS } from './navConfig';

export interface DesktopSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function DesktopSidebar({ collapsed, onToggle }: DesktopSidebarProps) {
  const { t } = useI18n();

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-card transition-[width] duration-200 md:flex',
        collapsed ? 'w-[76px]' : 'w-[240px]',
      )}
      style={{ borderColor: 'var(--border)' }}
    >
      <div className={cn('flex h-[72px] items-center gap-3 px-5', collapsed && 'justify-center px-0')}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
          <Clock3 className="h-5 w-5" aria-hidden />
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-ink">CHRONOS AI</p>
            <p className="truncate text-[11px] text-muted">{t('app.tagline')}</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={collapsed ? t(item.labelKey) : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? 'bg-primary/12 font-medium text-primary'
                    : 'text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/5',
                )
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-black/5 hover:text-ink dark:hover:bg-white/5',
            collapsed && 'justify-center px-0',
          )}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          {!collapsed && <span>{t('nav.collapse')}</span>}
        </button>
      </div>
    </aside>
  );
}
