import { Outlet } from 'react-router-dom';
import { MuseumNavigation } from '@/components/museum';
import { MobileTabBar } from '@/components/museum/MobileTabBar';
import { DevelopmentModal } from '@/components/home/DevelopmentModal';
import { CommandPalette, useCommandPalette } from '@/components/search/CommandPalette';

export function RootLayout() {
  const { open, setOpen } = useCommandPalette();

  return (
    <div className="flex flex-col h-screen overflow-hidden relative">
      <DevelopmentModal />
      <MuseumNavigation onOpenSearch={() => setOpen(true)} />
      <CommandPalette open={open} onOpenChange={setOpen} />
      {/* Нижняя панель перекрыла бы контент, поэтому место под неё
          вычитается из области прокрутки, а не накладывается поверх */}
      <main className="flex-1 overflow-hidden relative pt-16 w-full max-w-none pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </main>
      <MobileTabBar />
    </div>
  );
}
