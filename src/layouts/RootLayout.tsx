import { Outlet } from 'react-router-dom';
import { MuseumNavigation } from '@/components/museum';
import { ArcheSidebar } from '@/arche/ui/Sidebar';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { useArcheStore } from '@/arche/state/store';
import { useEffect } from 'react';

export function RootLayout() {
  const sidebarOpen = useArcheStore((state) => state.settings.sidebarOpen);
  const setSidebarOpen = useArcheStore((state) => state.setSidebarOpen);
  const theme = useArcheStore((state) => state.settings.theme);

  // Синхронизация темы с DOM
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, [theme]);

  return (
    <div className="flex flex-col h-screen overflow-hidden relative">
      <MuseumNavigation />
      <main className="flex-1 overflow-hidden relative pt-16">
        <Outlet />
      </main>
    </div>
  );
}

