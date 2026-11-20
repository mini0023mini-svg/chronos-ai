import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { NAV_ITEMS } from './navConfig';

/** 手机底部导航：5 个主入口（含 Settings），其余从「更多」页面或各页进入 */
const MOBILE_ITEMS = NAV_ITEMS.filter((item) => item.primary).slice(0, 5);

export function MobileBottomNav() {
  const { t } = useI18n();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex h-[64px] items-stretch border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      style={{ borderColor: 'var(--border)' }}
      aria-label="Mobile navigation"
    >
      {MOBILE_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] transition',
                isActive ? 'text-primary' : 'text-muted',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', isActive && 'bg-primary/12')}>
                  <Icon className="h-[19px] w-[19px]" aria-hidden />
                </span>
                <span className="max-w-full truncate px-1">{t(item.labelKey)}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
