import { FilterState, ZoomLevel } from './types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface TimelineFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  zoomLevel: ZoomLevel;
  onZoomChange: (level: ZoomLevel) => void;
  className?: string;
}

const TYPE_OPTIONS = [
  { value: 'hub', label: 'Хабы' },
  { value: 'time', label: 'Эпохи' },
  { value: 'concept', label: 'Концепции' },
  { value: 'person', label: 'Персоны' },
  { value: 'work', label: 'Работы' },
  { value: 'place', label: 'Места' },
  { value: 'event', label: 'События' },
  { value: 'note', label: 'Заметки' },
];

const DOMAIN_OPTIONS = [
  { value: 'philosophy', label: 'Философия' },
  { value: 'art', label: 'Искусство' },
  { value: 'literature', label: 'Литература' },
  { value: 'science', label: 'Наука' },
  { value: 'history', label: 'История' },
  { value: 'psychology', label: 'Психология' },
];

export function TimelineFilters({
  filters,
  onFiltersChange,
  zoomLevel,
  onZoomChange,
  className,
}: TimelineFiltersProps) {
  const toggleType = (type: string) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter(t => t !== type)
      : [...filters.types, type];
    
    onFiltersChange({ ...filters, types: newTypes });
  };
  
  const toggleDomain = (domain: string) => {
    const newDomains = filters.domains.includes(domain)
      ? filters.domains.filter(d => d !== domain)
      : [...filters.domains, domain];
    
    onFiltersChange({ ...filters, domains: newDomains });
  };
  
  const clearAllFilters = () => {
    onFiltersChange({ types: [], domains: [], statuses: [] });
  };

  const hasActiveFilters = filters.types.length > 0 || filters.domains.length > 0;

  return (
    <div className={cn('flex flex-col gap-3 px-6 py-4', className)}>
      {/* Первая строка: типы + зум */}
      <div className="flex items-center justify-between gap-4">
        {/* Фильтры по типам */}
        <div className="flex items-center gap-2 flex-1">
          <span className="text-sm text-muted-foreground mr-2">Типы:</span>
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map(option => {
              const isActive = filters.types.length === 0 || filters.types.includes(option.value);
              
              return (
                <button
                  key={option.value}
                  onClick={() => toggleType(option.value)}
                  className={cn(
                    'px-3 py-1 text-xs rounded-full border transition-all',
                    isActive
                      ? 'bg-accent border-border text-foreground'
                      : 'bg-background border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Управление зумом */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground mr-2">Масштаб:</span>
          <div className="flex items-center gap-1 border border-border/30 rounded-lg p-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onZoomChange('out')}
              className={cn(
                'h-8 px-3',
                zoomLevel === 'out' && 'bg-accent'
              )}
              title="Далёкий: века/эпохи"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Переключение полноэкранного режима
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen().catch(err => {
                    console.warn('Failed to enter fullscreen:', err);
                  });
                } else {
                  document.exitFullscreen().catch(err => {
                    console.warn('Failed to exit fullscreen:', err);
                  });
                }
              }}
              className="h-8 px-3"
              title="Полноэкранный режим"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onZoomChange('in')}
              className={cn(
                'h-8 px-3',
                zoomLevel === 'in' && 'bg-accent'
              )}
              title="Близкий: годы"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Вторая строка: домены + сброс фильтров */}
      <div className="flex items-center justify-between gap-4">
        {/* Фильтры по доменам */}
        <div className="flex items-center gap-2 flex-1">
          <span className="text-sm text-muted-foreground mr-2">Домены:</span>
          <div className="flex flex-wrap gap-2">
            {DOMAIN_OPTIONS.map(option => {
              const isActive = filters.domains.length === 0 || filters.domains.includes(option.value);
              
              return (
                <button
                  key={option.value}
                  onClick={() => toggleDomain(option.value)}
                  className={cn(
                    'px-3 py-1 text-xs rounded-full border transition-all',
                    isActive
                      ? 'bg-accent border-border text-foreground'
                      : 'bg-background border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Сброс фильтров */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Сбросить фильтры
          </Button>
        )}
      </div>
    </div>
  );
}

