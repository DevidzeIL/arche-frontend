import { Link, useLocation } from 'react-router-dom';
import { Flame, Home, Layers, Waypoints } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Нижняя панель на телефоне.
 *
 * Раньше все разделы жили в бургер-меню: чтобы попасть в «Сегодня», нужно
 * было два касания и выдвижная панель — каждый день, ради того, ради чего
 * приложение и делалось. Здесь только ежедневное; всё остальное осталось
 * в меню сверху.
 *
 * Панель внизу ещё и потому, что низ экрана достаётся большим пальцем,
 * а верх — нет.
 */
const TABS = [
  { path: '/', label: 'Главная', icon: Home },
  { path: '/timeline', label: 'Карта', icon: Waypoints },
  { path: '/feed', label: 'Листать', icon: Layers },
  { path: '/study/today', label: 'Сегодня', icon: Flame },
];

export function MobileTabBar() {
  const location = useLocation();

  // Побеждает самое длинное совпадение, иначе «Главная» подсвечивалась бы всегда
  const activePath = TABS.map((tab) => tab.path)
    .filter((path) =>
      path === '/'
        ? location.pathname === '/'
        : location.pathname === path || location.pathname.startsWith(`${path}/`)
    )
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav
      aria-label="Основные разделы"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border/40 bg-background/95 backdrop-blur-lg md:hidden',
        'pb-[env(safe-area-inset-bottom)]'
      )}
    >
      <ul className="flex">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.path === activePath;

          return (
            <li key={tab.path} className="flex-1">
              <Link
                to={tab.path}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-0.5 transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                <Icon className={cn('h-5 w-5', active && 'scale-110')} aria-hidden />
                <span className="text-[10px] leading-none">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
