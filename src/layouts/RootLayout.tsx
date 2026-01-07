import { Outlet } from 'react-router-dom';
import { MuseumNavigation } from '@/components/museum';
import { useArcheStore } from '@/arche/state/store';
import { useEffect } from 'react';
import { DevelopmentModal } from '@/components/home/DevelopmentModal';

export function RootLayout() {
  const theme = useArcheStore((state) => state.settings.theme);

  // Синхронизация темы с DOM
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, [theme]);

  return (
    <div className="flex flex-col h-screen overflow-hidden relative">
      <DevelopmentModal />
      <MuseumNavigation />
      <main className="flex-1 overflow-hidden relative pt-16 w-full max-w-none">
        <Outlet />
      </main>
    </div>
  );
}

