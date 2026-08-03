import { cn } from '@/lib/utils';
import { noteTypeMeta } from '@/arche/noteTypes';

interface TypeBadgeProps {
  type?: string;
  className?: string;
}

export function TypeBadge({ type, className }: TypeBadgeProps) {
  if (!type) return null;

  const meta = noteTypeMeta(type);

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 text-xs font-medium',
        'border rounded-full whitespace-nowrap shrink-0',
        className
      )}
      style={{
        color: `var(${meta.colorVar})`,
        borderColor: `color-mix(in oklab, var(${meta.colorVar}) 35%, transparent)`,
      }}
    >
      {meta.label}
    </span>
  );
}
