import { useArcheStore } from '../state/store';
import { Button } from '@/components/ui/button';
import { X, Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ArcheTabs() {
  const tabs = useArcheStore((state) => state.settings.tabs);
  const activeTabId = useArcheStore((state) => state.settings.activeTabId);
  const setActiveTab = useArcheStore((state) => state.setActiveTab);
  const closeTab = useArcheStore((state) => state.closeTab);
  const pinTab = useArcheStore((state) => state.pinTab);
  const unpinTab = useArcheStore((state) => state.unpinTab);

  if (tabs.length === 0) {
    return (
      <div className="border-b bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
        Нет открытых вкладок
      </div>
    );
  }

  // Сортируем: сначала закреплённые, потом обычные
  const sortedTabs = [...tabs].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  return (
    <div className="border-b bg-muted/40">
      <div className="flex overflow-x-auto">
        {sortedTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={cn(
                'flex items-center gap-1 border-r border-border px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-background border-b-2 border-b-primary'
                  : 'hover:bg-muted'
              )}
            >
              <button
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-1 text-left truncate max-w-[200px]',
                  isActive && 'font-medium'
                )}
              >
                {tab.title}
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => (tab.pinned ? unpinTab(tab.id) : pinTab(tab.id))}
              >
                {tab.pinned ? (
                  <Pin className="h-3 w-3" />
                ) : (
                  <PinOff className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => closeTab(tab.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}





