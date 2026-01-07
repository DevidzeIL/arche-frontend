/**
 * TimelineNavButtons - Кнопки навигации к ближайшим записям
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TimelineNavButtonsProps {
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  className?: string;
}

export function TimelineNavButtons({
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  className,
}: TimelineNavButtonsProps) {
  return (
    <div className={cn('absolute inset-y-0 flex items-center pointer-events-none z-40', className)}>
      {/* Кнопка влево */}
      <div className="absolute left-4 pointer-events-auto">
        <Button
          variant="outline"
          size="icon"
          onClick={onPrevious}
          disabled={!hasPrevious}
          className={cn(
            'rounded-full w-10 h-10 shadow-lg',
            !hasPrevious && 'opacity-30 cursor-not-allowed'
          )}
          title="К предыдущей записи"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>
      
      {/* Кнопка вправо */}
      <div className="absolute right-4 pointer-events-auto">
        <Button
          variant="outline"
          size="icon"
          onClick={onNext}
          disabled={!hasNext}
          className={cn(
            'rounded-full w-10 h-10 shadow-lg',
            !hasNext && 'opacity-30 cursor-not-allowed'
          )}
          title="К следующей записи"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

