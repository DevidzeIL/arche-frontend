import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Home,
  Waypoints,
  Globe2,
  GraduationCap,
  Flame,
  Layers,
  Mail,
  Moon,
  Sun,
  Menu,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useArcheStore } from '@/arche/state/store';
import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface NavigationItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Отдельная вкладка графа убрана: карта показывает те же связи,
// но с осью времени и объяснением каждой из них
const navigationItems: NavigationItem[] = [
  { path: '/', label: 'Главная', icon: Home },
  { path: '/timeline', label: 'Карта', icon: Waypoints },
  { path: '/globe', label: 'Глобус', icon: Globe2 },
  { path: '/feed', label: 'Листать', icon: Layers },
  { path: '/study/today', label: 'Сегодня', icon: Flame },
  { path: '/study', label: 'Учёба', icon: GraduationCap },
];

interface MuseumNavigationProps {
  onOpenSearch?: () => void;
}

export function MuseumNavigation({ onOpenSearch }: MuseumNavigationProps) {
  const location = useLocation();
  const theme = useArcheStore((state) => state.settings.theme);
  const setTheme = useArcheStore((state) => state.setTheme);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  // Побеждает самое длинное совпадение: иначе «Сегодня» (/study/today)
  // и «Учёба» (/study) подсвечивались бы одновременно
  const activePath = navigationItems
    .map((item) => item.path)
    .filter((path) =>
      path === '/'
        ? location.pathname === '/'
        : location.pathname === path || location.pathname.startsWith(`${path}/`)
    )
    .sort((a, b) => b.length - a.length)[0];

  const isActive = (path: string) => path === activePath;

  const handleNavClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-b border-border/30">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Лого */}
          <Link to="/" className="flex items-center space-x-3">
            <div className="text-2xl font-serif font-light text-foreground/95">
              Arche
            </div>
          </Link>

          {/* Навигация - Desktop */}
          <div className="hidden md:flex items-center space-x-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200',
                    'text-sm font-medium',
                    active
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Действия */}
          <div className="flex items-center space-x-2">
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                aria-label="Поиск по заметкам"
                className={cn(
                  'hidden sm:flex items-center gap-2 h-9 pl-3 pr-1.5 rounded-lg border border-border/60 bg-background/40',
                  'text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors'
                )}
              >
                <Search className="h-4 w-4 shrink-0" aria-hidden />
                <span className="leading-none">Поиск</span>
                <kbd
                  className={cn(
                    'ml-1 inline-flex h-5 items-center rounded border border-border/60 px-1.5',
                    'font-sans text-[10px] leading-none text-muted-foreground'
                  )}
                >
                  ⌘K
                </kbd>
              </button>
            )}

            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/contact" aria-label="Написать разработчику">
                <Mail className="h-4 w-4" aria-hidden />
              </Link>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'}
              className="rounded-full"
            >
              {theme === 'light' ? (
                <Moon className="h-4 w-4" aria-hidden />
              ) : (
                <Sun className="h-4 w-4" aria-hidden />
              )}
            </Button>

            {/* Бургер-меню - Mobile */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden rounded-full"
                >
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Открыть меню</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                <SheetHeader>
                  <SheetTitle className="text-2xl font-serif font-light">
                    Arche
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col space-y-2 mt-8">
                  {onOpenSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenSearch();
                      }}
                      className={cn(
                        'flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 w-full',
                        'text-base font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50'
                      )}
                    >
                      <Search className="h-5 w-5" aria-hidden />
                      <span>Поиск</span>
                    </button>
                  )}
                  {navigationItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={handleNavClick}
                        className={cn(
                          'flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200',
                          'text-base font-medium',
                          active
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                  <Link
                    to="/contact"
                    onClick={handleNavClick}
                    className={cn(
                      'flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200',
                      'text-base font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    )}
                  >
                    <Mail className="h-5 w-5" aria-hidden />
                    <span>Написать</span>
                  </Link>
                  <div className="pt-4 border-t border-border">
                    <button
                      onClick={toggleTheme}
                      className={cn(
                        'flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 w-full',
                        'text-base font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50'
                      )}
                    >
                      {theme === 'light' ? (
                        <>
                          <Moon className="h-5 w-5" />
                          <span>Тёмная тема</span>
                        </>
                      ) : (
                        <>
                          <Sun className="h-5 w-5" />
                          <span>Светлая тема</span>
                        </>
                      )}
                    </button>
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}

