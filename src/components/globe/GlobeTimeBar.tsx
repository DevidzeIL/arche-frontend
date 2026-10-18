import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { formatYear } from '@/arche/timeSpan';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface TimeBand {
  id: string;
  title: string;
  from: number;
  to: number;
}

/** Деления ползунка: целое число, чтобы input type=range ходил ровно */
const RESOLUTION = 1000;

/**
 * Узлы неравномерной шкалы: год и доля ползунка до него.
 *
 * На равномерной шкале пять тысяч лет делили полтысячи пикселей поровну,
 * и весь XIX век занимал десяток пикселей, а бронзовый век — столько же
 * места, сколько Возрождение. Материала в хранилище тем больше, чем ближе
 * к нам, — шкала растягивается так же.
 */
const KNOTS: Array<[number, number]> = [
  [-3500, 0],
  [-1000, 0.1],
  [0, 0.24],
  [1000, 0.42],
  [1500, 0.58],
  [1800, 0.78],
  [2030, 1],
];

function makeScale(min: number, max: number) {
  // Узлы внутри границ плюс сами границы — и перенормировка на [0, 1]
  const inner = KNOTS.filter(([y]) => y > min && y < max);
  const at = (year: number) => {
    for (let i = 1; i < KNOTS.length; i++) {
      const [y0, p0] = KNOTS[i - 1];
      const [y1, p1] = KNOTS[i];
      if (year <= y1) return p0 + ((Math.max(year, y0) - y0) / (y1 - y0)) * (p1 - p0);
    }
    return 1;
  };
  const points: Array<[number, number]> = [[min, at(min)], ...inner.map(([y, p]) => [y, p] as [number, number]), [max, at(max)]];
  const p0 = points[0][1];
  const span = points[points.length - 1][1] - p0 || 1;
  const knots = points.map(([y, p]) => [y, (p - p0) / span] as [number, number]);

  const toPos = (year: number) => {
    const y = Math.max(min, Math.min(max, year));
    for (let i = 1; i < knots.length; i++) {
      const [y0, q0] = knots[i - 1];
      const [y1, q1] = knots[i];
      if (y <= y1) return q0 + ((y - y0) / (y1 - y0 || 1)) * (q1 - q0);
    }
    return 1;
  };
  const toYear = (pos: number) => {
    const q = Math.max(0, Math.min(1, pos));
    for (let i = 1; i < knots.length; i++) {
      const [y0, q0] = knots[i - 1];
      const [y1, q1] = knots[i];
      if (q <= q1) return y0 + ((q - q0) / (q1 - q0 || 1)) * (y1 - y0);
    }
    return max;
  };
  return { toPos, toYear };
}

/** «428 до н.э.», «-428», «1781» → год; null — не разобрать */
export function parseYear(text: string): number | null {
  const bc = /до\s*н\.?\s*э|bc|b\.c|до\s*р\.?\s*х/i.test(text);
  const match = text.replace(/\s/g, '').match(/-?\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isFinite(value) || value === 0) return null;
  return bc ? -Math.abs(value) : value;
}

const LABEL_YEARS = [-3000, -2000, -1000, -500, 0, 500, 1000, 1500, 1800, 1900, 2000];

const BAND_COLORS = ['#e0af68', '#7aa2f7', '#9ece6a', '#bb9af7', '#f7768e', '#73daca'];

export function GlobeTimeBar({
  year,
  min,
  max,
  playing,
  step,
  bands,
  ticks,
  info,
  onYear,
  onTogglePlay,
}: {
  year: number;
  min: number;
  max: number;
  playing: boolean;
  step: number;
  /** Эпохи хранилища — полосы под ползунком */
  bands: TimeBand[];
  /** Годы заметок хранилища — засечки */
  ticks: number[];
  info: React.ReactNode;
  onYear: (year: number) => void;
  onTogglePlay: () => void;
}) {
  const scale = useMemo(() => makeScale(min, max), [min, max]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const rounded = Math.round(year);
  const epoch = bands.find((b) => b.from <= rounded && rounded <= b.to);

  const commit = () => {
    const parsed = parseYear(draft);
    if (parsed !== null) onYear(Math.max(min, Math.min(max, parsed)));
    setEditing(false);
  };

  const pct = (y: number) => `${scale.toPos(y) * 100}%`;

  return (
    <div className="pointer-events-auto mx-auto max-w-3xl rounded-xl border border-border/50 bg-card/90 px-2 py-2 backdrop-blur-sm sm:px-3">
      <div className="flex items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onTogglePlay}
          aria-label={playing ? 'Остановить' : 'Проиграть историю'}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => onYear(Math.max(min, rounded - step))}
          aria-label={`На ${step} назад`}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder="1781 или 428 до н.э."
            className="h-8 w-36 rounded-md border border-border bg-background px-2 text-sm tabular-nums"
            aria-label="Год"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(rounded < 0 ? `${-rounded} до н.э.` : String(rounded));
              setEditing(true);
            }}
            className="h-8 shrink-0 rounded-md px-2 text-sm font-medium tabular-nums hover:bg-accent"
            title="Ввести год"
          >
            {formatYear(rounded)}
          </button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => onYear(Math.min(max, rounded + step))}
          aria-label={`На ${step} вперёд`}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
          {epoch && <span className="mr-1.5 font-medium text-foreground/80">{epoch.title}</span>}
          <span className="hidden sm:inline">{info}</span>
        </span>
        {/* Кнопка всегда занимает своё место и в конце шкалы только прячется:
            если убирать её из разметки, ползунок у правого края становится
            шире, бегунок прыгает под пальцем и кнопка мигает */}
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8 shrink-0', rounded >= max && 'invisible')}
          onClick={() => onYear(max)}
          disabled={rounded >= max}
          aria-hidden={rounded >= max}
          tabIndex={rounded >= max ? -1 : 0}
          aria-label="Показать всё время"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <div className="relative mx-1 mt-1 h-8">
        <div className="absolute inset-x-0 top-[14px] h-1 rounded-full bg-border/60" aria-hidden />
        {/* Эпохи хранилища */}
        {bands.map((band, i) => (
          <div
            key={band.id}
            className="absolute top-[13px] h-1.5 rounded-full opacity-60"
            style={{
              left: pct(band.from),
              width: `calc(${pct(band.to)} - ${pct(band.from)})`,
              background: BAND_COLORS[i % BAND_COLORS.length],
            }}
            title={`${band.title}: ${formatYear(band.from)} — ${formatYear(band.to)}`}
          />
        ))}
        {/* Заметки хранилища */}
        {ticks.map((t, i) => (
          <div
            key={`${t}-${i}`}
            className="absolute top-[7px] h-1.5 w-px bg-foreground/40"
            style={{ left: pct(t) }}
            aria-hidden
          />
        ))}
        <input
          type="range"
          min={0}
          max={RESOLUTION}
          step={1}
          value={Math.round(scale.toPos(year) * RESOLUTION)}
          onChange={(e) => onYear(Math.round(scale.toYear(Number(e.target.value) / RESOLUTION)))}
          aria-label="Год"
          aria-valuetext={formatYear(rounded)}
          className="absolute inset-x-0 top-[12px] h-2 w-full cursor-pointer appearance-none rounded-full bg-transparent accent-primary"
        />
        {LABEL_YEARS.filter((y) => y > min && y < max).map((y) => (
          <span
            key={y}
            className="pointer-events-none absolute top-[22px] -translate-x-1/2 text-[9px] tabular-nums text-muted-foreground/70"
            style={{ left: pct(y) }}
          >
            {y < 0 ? `${-y} до` : y}
          </span>
        ))}
      </div>
    </div>
  );
}
