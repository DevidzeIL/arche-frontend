import { useMemo } from 'react';
import { TimelineNote } from './types';

interface ConnectionLinesProps {
  focusedNote: TimelineNote;
  relatedNotes: TimelineNote[];
  yearToPixel: (year: number) => number;
  containerWidth: number;
}

/**
 * Рисует линии связей между focused заметкой и related
 */
export function ConnectionLines({
  focusedNote,
  relatedNotes,
  yearToPixel,
  containerWidth,
}: ConnectionLinesProps) {
  const lines = useMemo(() => {
    const focusedX = yearToPixel(focusedNote.timeline.displayYear);
    const focusedY = containerWidth / 2; // центр по вертикали (условно)
    
    return relatedNotes.map(note => {
      const targetX = yearToPixel(note.timeline.displayYear);
      const targetY = containerWidth / 2;
      
      return {
        id: note.id,
        x1: focusedX,
        y1: focusedY,
        x2: targetX,
        y2: targetY,
      };
    });
  }, [focusedNote, relatedNotes, yearToPixel, containerWidth]);

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ zIndex: 5 }} // ← Ниже карточек (10-20), не перехватывает события
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      
      {lines.map(line => (
        <line
          key={line.id}
          x1={line.x1}
          y1="50%"
          x2={line.x2}
          y2="50%"
          stroke="url(#lineGradient)"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.7"
        />
      ))}
    </svg>
  );
}

