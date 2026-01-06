import { useEffect } from 'react';
import { useArcheStore } from '../state/store';
import { ArcheSidebar } from './Sidebar';
import { ArcheTabs } from './Tabs';
import { NoteViewer } from './NoteViewer';
// Graph removed
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';

export function Dashboard() {
  const loaded = useArcheStore((state) => state.loaded);
  const loadNotes = useArcheStore((state) => state.loadNotes);
  const theme = useArcheStore((state) => state.settings.theme);
  const setTheme = useArcheStore((state) => state.setTheme);
  const sidebarOpen = useArcheStore((state) => state.settings.sidebarOpen);
  const setSidebarOpen = useArcheStore((state) => state.setSidebarOpen);

  useEffect(() => {
    if (!loaded) {
      console.log('Loading notes...');
      loadNotes()
        .then(() => {
          console.log('Notes loaded successfully');
        })
        .catch((error) => {
          console.error('Error loading notes:', error);
        });
    }
  }, [loaded, loadNotes]);

  useEffect(() => {
    // Применяем тему при загрузке
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Загрузка заметок...</div>
          <div className="text-sm text-muted-foreground">
            Пожалуйста, подождите
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <ArcheSidebar />
      <SidebarInset className="h-screen flex flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div className="flex items-center justify-between flex-1">
            <h1 className="text-xl font-semibold">Arche Explorer</h1>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={toggleTheme}
              >
                {theme === 'light' ? (
                  <Moon className="h-4 w-4" />
                ) : (
                  <Sun className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </header>

        <ArcheTabs />
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <NoteViewer />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

