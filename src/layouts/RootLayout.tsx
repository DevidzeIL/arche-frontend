import { Outlet } from 'react-router-dom';
import { MuseumNavigation } from '@/components/museum';
import { DevelopmentModal } from '@/components/home/DevelopmentModal';
import { CommandPalette, useCommandPalette } from '@/components/search/CommandPalette';

export function RootLayout() {
  const { open, setOpen } = useCommandPalette();

  return (
    <div className="flex flex-col h-screen overflow-hidden relative">
      <DevelopmentModal />
      <MuseumNavigation onOpenSearch={() => setOpen(true)} />
      <CommandPalette open={open} onOpenChange={setOpen} />
      <main className="flex-1 overflow-hidden relative pt-16 w-full max-w-none">
        <Outlet />
      </main>
    </div>
  );
}
