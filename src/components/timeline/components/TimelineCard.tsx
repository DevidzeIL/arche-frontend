/**
 * TimelineCard - Pixel-perfect карточка
 * ✅ FIX: pointer events на внутреннем элементе
 * ✅ FIX: четкая система z-index
 * ✅ FIX: без blur/динамических размеров
 */

import { memo, useMemo } from 'react';
import { CardLayoutItem } from '../core/timelineLayout';
import { TimelineNote } from '../types';
import { TypeBadge } from '@/components/museum';
import { cn } from '@/lib/utils';
import { formatYear } from '../utils';
import { snap, snapTransform } from '../utils/pixelSnap';

interface TimelineCardV2Props {
  note: TimelineNote;
  layout: CardLayoutItem;
  onClick: (noteId: string) => void;
  onHover?: (noteId: string | null) => void;
  isFocused: boolean;
  isHovered?: boolean;
  isRelated?: boolean;
  isDimmed: boolean;
}

export const TimelineCard = memo(function TimelineCard({
  note,
  layout,
  onClick,
  onHover,
  isFocused,
  isHovered = false,
  isRelated = false,
  isDimmed,
}: TimelineCardV2Props) {
  const { timeline } = note;
  
  // Фиксированные размеры (pixel-perfect)
  const CARD_WIDTH = 320;
  const CARD_HEIGHT = 160;
  
  // Вычисляем opacity без blur
  const opacity = isDimmed ? 0.3 : 1.0;
  
  // Извлекаем первое изображение из body заметки
  const firstImage = useMemo(() => {
    if (!note.body) return null;
    
    // Ищем ![[image.png]] или ![alt](path) или <img>
    const wikilinkImageMatch = note.body.match(/!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|svg))\]\]/i);
    if (wikilinkImageMatch) {
      const filename = wikilinkImageMatch[1];
      return `/arche-vault/_imgs/${filename}`;
    }
    
    const markdownImageMatch = note.body.match(/!\[[^\]]*\]\(([^\)]+\.(png|jpg|jpeg|gif|webp|svg))\)/i);
    if (markdownImageMatch) {
      let imagePath = markdownImageMatch[1];
      if (!imagePath.startsWith('/') && !imagePath.startsWith('http')) {
        imagePath = `/arche-vault/_imgs/${imagePath.split('/').pop()}`;
      }
      return imagePath;
    }
    
    const htmlImageMatch = note.body.match(/<img[^>]+src=["']([^"']+\.(png|jpg|jpeg|gif|webp|svg))["']/i);
    if (htmlImageMatch) {
      return htmlImageMatch[1];
    }
    
    return null;
  }, [note.body]);
  
  // Z-index система (чёткая иерархия)
  // Базовый z-index должен быть выше трека (трек ~1, карточки ~10+)
  let zIndex = 10; // базовый - выше трека
  if (isRelated) zIndex = 15; // связанные
  if (isHovered) zIndex = 20; // hover выше связанных
  if (isFocused) zIndex = 25; // focus - наивысший
  
  return (
    <div
      className="absolute pointer-events-none"
      data-card-id={note.id}
      style={{
        left: `${snap(layout.viewX)}px`,
        top: `${snap(layout.viewY)}px`,
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        transform: snapTransform(-CARD_WIDTH / 2, -CARD_HEIGHT / 2),
        zIndex,
        opacity,
        transition: 'opacity 200ms ease-out, z-index 0ms',
        willChange: 'opacity',
      }}
    >
      {/* КАРТОЧКА - здесь pointer events! */}
      <div
        className={cn(
          'w-full h-full rounded-lg border bg-card text-card-foreground shadow-sm',
          'cursor-pointer pointer-events-auto',
          'transition-all duration-200',
          // States с чёткой приоритетностью
          isFocused && 'ring-2 ring-primary shadow-2xl border-primary/60',
          !isFocused && isHovered && 'ring-2 ring-primary/60 shadow-lg border-primary/40',
          !isFocused && !isHovered && isRelated && 'ring-1 ring-primary/30 shadow-md border-primary/20',
          !isFocused && !isHovered && !isRelated && 'border-border/30'
        )}
        onMouseEnter={(e) => {
          e.stopPropagation();
          onHover?.(note.id);
        }}
        onMouseLeave={(e) => {
          e.stopPropagation();
          onHover?.(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick(note.id);
        }}
        role="button"
        tabIndex={0}
        aria-label={`${note.title}, ${formatYear(timeline.startYear)}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(note.id);
          }
        }}
      >
        <div className="h-full flex flex-col overflow-hidden rounded-lg">
          {/* Изображение (если есть) - по верхнему краю */}
          {firstImage && !isDimmed && (
            <div className="w-full h-24 overflow-hidden bg-muted flex-shrink-0">
              <img
                src={firstImage}
                alt={note.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          
          <div className={cn("p-4 flex-1 flex flex-col justify-between", !firstImage && "h-full")}>
          {/* Заголовок и тип */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-serif text-base leading-tight flex-1 line-clamp-2">
              {note.title}
            </h3>
            <TypeBadge type={note.type} />
          </div>
          
          {/* Временной период */}
          <div className="text-xs font-mono text-muted-foreground">
            {timeline.endYear
              ? `${formatYear(timeline.startYear)}—${formatYear(timeline.endYear)}`
              : formatYear(timeline.startYear)}
          </div>
          
          {/* Превью текста - LOD (только если не dimmed) */}
          {!isDimmed && note.plainText && (isFocused || isHovered) && (
            <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed mt-2">
              {note.plainText
                .replace(/!\[\[[^\]]+\]\]/g, '') // Убираем ![[image.png]]
                .replace(/!\[[^\]]*\]\([^\)]+\)/g, '') // Убираем ![alt](path)
                .replace(/<img[^>]+>/gi, '') // Убираем <img> теги
                .replace(/^\s*!?[^\s]+\.(png|jpg|jpeg|gif|webp|svg)\s*/gi, '') // Убираем названия файлов в начале строки
                .trim()
                .substring(0, 150)}
            </p>
          )}
          
          {/* Домены - LOD (только focused) */}
          {isFocused && note.domain && note.domain.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {note.domain.slice(0, 3).map((domain) => (
                <span
                  key={domain}
                  className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground"
                >
                  {domain}
                </span>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
});

