import { cn } from '@/lib/utils';

const TYPE_COLORS: Record<string, string> = {
  person: 'text-[var(--type-person)] border-[var(--type-person)]/30',
  concept: 'text-[var(--type-concept)] border-[var(--type-concept)]/30',
  work: 'text-[var(--type-work)] border-[var(--type-work)]/30',
  time: 'text-[var(--type-time)] border-[var(--type-time)]/30',
  place: 'text-[var(--type-place)] border-[var(--type-place)]/30',
  note: 'text-[var(--type-note)] border-[var(--type-note)]/30',
  hub: 'text-foreground/60 border-border/30',
};

const TYPE_LABELS: Record<string, string> = {
  person: 'Персона',
  concept: 'Концепция',
  work: 'Работа',
  time: 'Эпоха',
  place: 'Место',
  note: 'Заметка',
  hub: 'Хаб',
};

interface TypeBadgeProps {
  type?: string;
  className?: string;
}

export function TypeBadge({ type, className }: TypeBadgeProps) {
  if (!type) return null;

  const colorClass = TYPE_COLORS[type] || TYPE_COLORS.note;
  const label = TYPE_LABELS[type] || type;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 text-xs font-medium',
        'border rounded-full',
        colorClass,
        className
      )}
    >
      {label}
    </span>
  );
}

