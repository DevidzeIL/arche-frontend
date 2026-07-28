import { Outlet } from 'react-router-dom';
import { MuseumNavigation } from '@/components/museum';
import { DevelopmentModal } from '@/components/home/DevelopmentModal';

export function RootLayout() {
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

