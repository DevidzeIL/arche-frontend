import { useEffect, useRef, useState } from 'react';
import { useArcheStore } from '@/arche/state/store';
import { ArcheNote } from '@/arche/types';
import { cn } from '@/lib/utils';
import { MuseumCard } from './MuseumCard';
import { TypeBadge } from './TypeBadge';

interface TimelineEra {
  name: string;
  startYear: number;
  endYear: number;
  notes: ArcheNote[];
}

interface TimelineProps {
  onNoteClick?: (noteId: string) => void;
  className?: string;
}

export function Timeline({ onNoteClick, className }: TimelineProps) {
  const notes = useArcheStore((state) => state.notes);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({
    start: -500,
    end: 2025,
  });

  // Группируем заметки по эпохам/векам
  const eras: TimelineEra[] = [
    { name: 'Античность', startYear: -800, endYear: 500, notes: [] },
    { name: 'Средневековье', startYear: 500, endYear: 1400, notes: [] },
    { name: 'Возрождение', startYear: 1400, endYear: 1600, notes: [] },
    { name: 'Новое время', startYear: 1600, endYear: 1800, notes: [] },
    { name: 'Предмодерн', startYear: 1800, endYear: 1900, notes: [] },
    { name: 'Модернизм', startYear: 1900, endYear: 1950, notes: [] },
    { name: 'Постмодерн', startYear: 1950, endYear: 2025, notes: [] },
  ];

  // Распределяем заметки по эпохам
  notes.forEach((note) => {
    // Пытаемся извлечь годы из метаданных или контента
    const years = extractYears(note);
    if (years.length > 0) {
      const avgYear = years.reduce((a, b) => a + b, 0) / years.length;
      const era = eras.find((e) => avgYear >= e.startYear && avgYear < e.endYear);
      if (era) {
        era.notes.push(note);
      }
    } else if (note.type === 'time' || note.folder === '01_Time') {
      // Если это эпоха, распределяем по названию
      const era = eras.find((e) =>
        note.title.toLowerCase().includes(e.name.toLowerCase().slice(0, 5))
      );
      if (era) {
        era.notes.push(note);
      }
    }
  });

  // Обработка скролла
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const scrollHeight = container.scrollHeight;

      // Вычисляем видимый диапазон лет
      const totalYears = 2025 - (-500);
      const scrollRatio = scrollTop / (scrollHeight - containerHeight);
      const visibleStart = -500 + scrollRatio * totalYears;
      const visibleEnd = visibleStart + (containerHeight / scrollHeight) * totalYears;

      setVisibleRange({ start: visibleStart, end: visibleEnd });
    };

    container.addEventListener('scroll', handleScroll);
    handleScroll(); // Инициализация

    return () => container.removeEventListener('scroll', handleScroll);
  }, [notes]);

  // Вычисляем позицию года на таймлайне
  const getYearPosition = (year: number): number => {
    const totalYears = 2025 - (-500);
    const ratio = (year - (-500)) / totalYears;
    return ratio * 100; // в процентах
  };

  // Рендерим линейку с веками
  const renderTimeRuler = () => {
    const centuries: number[] = [];
    for (let year = -500; year <= 2025; year += 100) {
      centuries.push(year);
    }

    return (
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/30">
        <div className="relative h-16">
          {centuries.map((century) => {
            const position = getYearPosition(century);
            const isVisible =
              century >= visibleRange.start - 200 && century <= visibleRange.end + 200;

            if (!isVisible) return null;

            return (
              <div
                key={century}
                className="absolute top-0 h-full flex flex-col items-center"
                style={{ left: `${position}%` }}
              >
                <div className="h-4 w-px bg-border/50" />
                <div className="mt-1 text-xs text-muted-foreground font-mono">
                  {century > 0 ? `${century}` : `${Math.abs(century)} до н.э.`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {renderTimeRuler()}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ scrollbarWidth: 'thin' }}
      >
        <div className="relative min-h-full py-12">
          {/* Эпохи */}
          {eras.map((era) => {
            const eraStartPos = getYearPosition(era.startYear);
            const eraEndPos = getYearPosition(era.endYear);
            const eraHeight = eraEndPos - eraStartPos;

            if (era.notes.length === 0) return null;

            return (
              <div
                key={era.name}
                className="absolute w-full"
                style={{
                  top: `${eraStartPos}%`,
                  height: `${eraHeight}%`,
                }}
              >
                <div className="sticky top-20">
                  <div className="mb-6">
                    <h2 className="text-2xl font-serif text-foreground/90 mb-2">{era.name}</h2>
                    <div className="text-sm text-muted-foreground">
                      {era.startYear} — {era.endYear}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {era.notes.map((note) => (
                      <MuseumCard
                        key={note.id}
                        variant="subtle"
                        onClick={() => onNoteClick?.(note.id)}
                        className="cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-serif">{note.title}</h3>
                              <TypeBadge type={note.type} />
                            </div>
                            {note.plainText && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {note.plainText.substring(0, 150)}...
                              </p>
                            )}
                          </div>
                        </div>
                      </MuseumCard>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Альтернативный вид: вертикальная линия с точками */}
          <div className="absolute left-8 top-0 bottom-0 w-px bg-border/20" />
        </div>
      </div>
    </div>
  );
}

// Вспомогательная функция для извлечения годов из заметки
function extractYears(note: ArcheNote): number[] {
  const years: number[] = [];

  // Ищем в frontmatter или контенте паттерны типа "384-322 до н.э." или "1900-1950"
  const content = `${note.rawContent} ${note.body}`;
  const yearPatterns = [
    /(\d{3,4})\s*[-–—]\s*(\d{3,4})\s*(?:до\s*н\.?\s*э\.?)?/gi,
    /(\d{3,4})\s*(?:до\s*н\.?\s*э\.?)?/gi,
  ];

  yearPatterns.forEach((pattern) => {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        let year = parseInt(match[1], 10);
        if (match[0].includes('до н.э') || match[0].includes('до н.э.')) {
          year = -year;
        }
        if (year >= -1000 && year <= 2100) {
          years.push(year);
        }
      }
      if (match[2]) {
        let year = parseInt(match[2], 10);
        if (match[0].includes('до н.э') || match[0].includes('до н.э.')) {
          year = -year;
        }
        if (year >= -1000 && year <= 2100) {
          years.push(year);
        }
      }
    }
  });

  return years;
}


