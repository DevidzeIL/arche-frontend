import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { useArcheStore } from './arche/state/store';
import { router } from './routes';
import './index.css';

function App() {
  const loaded = useArcheStore((state) => state.loaded);
  const loadNotes = useArcheStore((state) => state.loadNotes);
  const theme = useArcheStore((state) => state.settings.theme);

  // Загружаем заметки при старте
  useEffect(() => {
    if (!loaded) {
      loadNotes().catch(() => {
        // Error loading notes - handled by error boundary
      });
    }
  }, [loaded, loadNotes]);

  // Применяем тему
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, [theme]);

  // Показываем загрузку
  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="text-2xl font-serif text-foreground/90">Arche</div>
          <div className="text-sm text-muted-foreground">Загрузка заметок...</div>
          <div className="w-48 h-1 bg-border/30 rounded-full overflow-hidden mx-auto">
            <div className="h-full bg-foreground/20 animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}

export default App;
