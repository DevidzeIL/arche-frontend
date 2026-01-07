/**
 * TimelineNavigation - Навигация по ближайшим карточкам
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TimelineNavigationProps {
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  currentIndex: number;
  totalCount: number;
  className?: string;
}

export function TimelineNavigation({
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  currentIndex,
  totalCount,
  className,
}: TimelineNavigationProps) {
  return (
    <div
      className={cn(
        'fixed bottom-24 left-1/2 transform -translate-x-1/2 z-30',
        'flex items-center gap-2 bg-background/90 backdrop-blur-sm',
        'border border-border/40 rounded-lg px-3 py-2 shadow-lg',
        className
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onPrevious}
        disabled={!hasPrevious}
        className="h-8 w-8 p-0 rounded-md"
        title="Предыдущая карточка (←)"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      
      <div className="text-xs font-mono text-muted-foreground px-2">
        {currentIndex + 1} / {totalCount}
      </div>
      
      <Button
        variant="ghost"
        size="sm"
        onClick={onNext}
        disabled={!hasNext}
        className="h-8 w-8 p-0 rounded-md"
        title="Следующая карточка (→)"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

