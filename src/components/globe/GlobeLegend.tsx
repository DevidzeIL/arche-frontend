import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { GlobeLayers } from './globeSettings';

const KEY = 'arche-globe-legend-open';

function readOpen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Значок — такой же, как на карте: легенда должна узнаваться с первого взгляда */
function Symbol({ kind }: { kind: string }) {
  switch (kind) {
    case 'place':
      return <span className="h-2.5 w-2.5 rounded-full bg-[#7fc8a9]" />;
    case 'region':
      return <span className="h-3 w-3 rounded-full bg-[#e0af68] shadow-[0_0_6px_2px_rgba(224,175,104,0.45)]" />;
    case 'city':
      return <span className="h-2 w-2 rounded-full border border-foreground/70 bg-background" />;
    case 'capital':
      return <span className="h-2 w-2 border border-foreground/70 bg-background" />;
    case 'person':
      return <span className="h-2 w-2 rounded-full bg-[#2f7fa8] dark:bg-[#89c4e1]" />;
    case 'event':
      return <span className="h-2 w-2 rotate-45 bg-[#7c4dbd] dark:bg-[#c4a7e7]" />;
    case 'battle':
      return <span className="h-2 w-2 rotate-45 bg-[#e5484d]" />;
    case 'border':
      return <span className="h-0 w-4 border-t-[1.5px] border-foreground/70" />;
    case 'union':
      return <span className="h-0 w-4 border-t border-dashed border-foreground/70" />;
    case 'river':
      return <span className="h-0 w-4 rounded-full border-t-2 border-[hsl(206_55%_56%)] dark:border-[hsl(208_45%_50%)]" />;
    case 'selected':
      return <span className="h-3 w-3 rounded-full border-2 border-pink-600 dark:border-pink-400" />;
    default:
      return null;
  }
}

/**
 * Обозначения: что за точка, кружок, ромб и пунктир. Только включённые
 * слои — легенда не должна объяснять то, чего на карте нет. Свёрнута по
 * умолчанию и помнит, раскрывали ли её
 */
export function GlobeLegend({ layers, war }: { layers: GlobeLayers; war: boolean }) {
  const [open, setOpen] = useState(readOpen);
  const toggle = () =>
    setOpen((value) => {
      try {
        localStorage.setItem(KEY, value ? '0' : '1');
      } catch {
        // хранилище недоступно — просто не запомним
      }
      return !value;
    });

  const rows: Array<[string, string]> = [
    ['region', 'Ваша заметка о стране или регионе'],
    ['place', 'Ваша заметка о городе'],
    ['selected', 'Выбранное'],
  ];
  if (layers.cities) rows.push(['city', 'Город — ориентир, название того года']);
  if (layers.capitals) rows.push(['capital', 'Столица государства']);
  if (layers.people) rows.push(['person', 'Человек — по месту рождения']);
  if (layers.events) rows.push(['event', 'Событие']);
  if (war) rows.push(['battle', 'Сражение выбранной войны']);
  if (layers.states) {
    rows.push(['border', 'Граница государства']);
    rows.push(['union', 'Объединение: империя, союз']);
  }
  if (layers.geography) rows.push(['river', 'Река']);

  return (
    <div className="pointer-events-auto w-[240px] rounded-xl border border-border/50 bg-card/90 text-[12px] backdrop-blur-sm">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
        Обозначения
      </button>
      {open && (
        <ul className="space-y-1 px-2.5 pb-2.5">
          {rows.map(([kind, label]) => (
            <li key={kind} className="flex items-center gap-2">
              <span className="flex w-4 shrink-0 justify-center">
                <Symbol kind={kind} />
              </span>
              <span className="leading-tight">{label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
