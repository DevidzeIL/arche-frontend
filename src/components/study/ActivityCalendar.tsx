import { useMemo } from 'react';
import { activityDays } from '@/arche/learning/progressStore';
import { cn } from '@/lib/utils';

interface ActivityCalendarProps {
  history: Record<string, number>;
  /** Дневная норма — по ней считается насыщенность клетки */
  goal: number;
  /** Сколько дней показывать; округляется вверх до целых недель */
  days?: number;
}

const WEEKDAY_LABELS = ['Пн', '', 'Ср', '', 'Пт', '', 'Вс'];

/** Понедельник = 0: неделя в русском календаре начинается с него */
function weekdayIndex(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/**
 * Календарь занятий за последние недели.
 *
 * Смысл не в статистике, а в непрерывности: видимая цепочка закрашенных
 * дней — самое понятное напоминание, что сегодня стоит зайти.
 */
export function ActivityCalendar({ history, goal, days = 91 }: ActivityCalendarProps) {
  const weeks = useMemo(() => {
    const list = activityDays(history, days);
    // Дополняем началом недели, чтобы столбцы совпадали с днями недели
    const pad = weekdayIndex(list[0]?.day ?? '');
    const cells: Array<{ day: string; count: number } | null> = [
      ...Array<null>(pad).fill(null),
      ...list,
    ];

    const grouped: Array<Array<{ day: string; count: number } | null>> = [];
    for (let i = 0; i < cells.length; i += 7) grouped.push(cells.slice(i, i + 7));
    return grouped;
  }, [history, days]);

  const level = (count: number): number => {
    if (count === 0) return 0;
    const ratio = count / Math.max(1, goal);
    if (ratio >= 1) return 3;
    if (ratio >= 0.5) return 2;
    return 1;
  };

  const levelClass = [
    'bg-border/30',
    'bg-primary/30',
    'bg-primary/60',
    'bg-primary',
  ];

  return (
    <div className="flex gap-2">
      <div className="flex flex-col gap-[3px] pt-[1px]">
        {WEEKDAY_LABELS.map((label, i) => (
          <span
            key={i}
            className="h-[11px] text-[9px] leading-[11px] text-muted-foreground/70"
            aria-hidden
          >
            {label}
          </span>
        ))}
      </div>

      <div className="flex gap-[3px] overflow-x-auto">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }, (_, di) => {
              const cell = week[di];
              if (!cell) return <span key={di} className="h-[11px] w-[11px]" />;
              return (
                <span
                  key={di}
                  title={
                    cell.count > 0
                      ? `${formatDay(cell.day)} — ${cell.count} карточек`
                      : `${formatDay(cell.day)} — пропуск`
                  }
                  className={cn('h-[11px] w-[11px] rounded-[2px]', levelClass[level(cell.count)])}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
