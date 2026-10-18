import { useEffect, useMemo, useRef, useState } from 'react';
import { formatYear } from '@/arche/timeSpan';
import type { Kb } from '@/arche/kb';
import type { Ruler } from '@/arche/polityFacts';
import { cn } from '@/lib/utils';
import type { TimeBand } from './GlobeTimeBar';

export interface LaneBar {
  id: string;
  title: string;
  from: number;
  to: number;
  color: string;
  /** Что открыть по щелчку */
  target: { kind: 'kb'; id: string } | { kind: 'note'; id: string } | { kind: 'ruler'; id: string };
}

interface Lane {
  key: string;
  title: string;
  bars: LaneBar[];
}

/** Сколько рядов на дорожку: дальше — самые известные, остальное в поиске */
const MAX_ROWS = 3;
const ROW_HEIGHT = 18;
/** Ширина подписи на глаз: 10.5px шрифта — около 5.6px на букву */
const CHAR_PX = 5.6;
const LABEL_MAX_PX = 190;
const MAX_WAR_YEARS = 200;
const GAP_PX = 6;

const KIND_COLORS: Record<string, string> = {
  philosophy: '#7aa2f7',
  art: '#e0af68',
  literature: '#9ece6a',
  architecture: '#bb9af7',
  culture: '#73daca',
};

/**
 * Окно лент вокруг выбранного года: в XIX веке — полтора века,
 * в древности — тысячелетие. Так на ленте помещается то, что
 * осмысленно сравнивать
 */
function spanFor(year: number): number {
  if (year >= 1700) return 120;
  if (year >= 1000) return 250;
  if (year >= 0) return 400;
  return 700;
}

interface Placed {
  bar: LaneBar;
  /** Полоса — настоящий срок, в пикселях */
  x: number;
  span: number;
  /** Сколько места занимает вместе с подписью */
  extent: number;
}

/**
 * Укладка в ряды по месту на экране, а не по годам: двухлетняя война
 * занимает на ленте точку, но её подпись — полсотни пикселей. Если
 * считать только годы, соседние подписи налезают друг на друга и
 * обрезаются до «[Англ». Полоса рисуется по настоящим годам, подпись
 * идёт за ней, а ряд ищется под полосу вместе с подписью. Не влезло
 * в MAX_ROWS — не показываем: порядок уже «сначала идущие сейчас,
 * потом самые известные», так что выпадают мелкие
 */
function pack(bars: LaneBar[], x: (year: number) => number, width: number): Placed[][] {
  const rows: Array<{ placed: Placed[]; right: Array<[number, number]> }> = [];
  for (const bar of bars) {
    const left = x(bar.from);
    const span = Math.max(4, x(bar.to) - left);
    const label = Math.min(LABEL_MAX_PX, bar.title.length * CHAR_PX + 10);
    const extent = Math.min(Math.max(span, label), width - left);
    const placed = { bar, x: left, span, extent };
    const free = (r: (typeof rows)[number]) =>
      r.right.every(([a, b]) => left + extent + GAP_PX <= a || b + GAP_PX <= left);
    let row = rows.find(free);
    if (!row && rows.length < MAX_ROWS) {
      row = { placed: [], right: [] };
      rows.push(row);
    }
    if (!row) continue;
    row.placed.push(placed);
    row.right.push([left, left + extent]);
  }
  return rows.map((r) => r.placed);
}

/** Сначала то, что идёт в выбранный год, внутри — исходный порядок (по известности) */
const activeFirst = (bars: LaneBar[], year: number) =>
  bars
    .map((bar, i) => ({ bar, i, on: bar.from <= year && year <= bar.to ? 0 : 1 }))
    .sort((a, b) => a.on - b.on || a.i - b.i)
    .map(({ bar }) => bar);

/**
 * Ленты «эпохи и течения»: кто был современником кого.
 *
 * Глобус отвечает «где», шкала — «когда», а ленты — «что шло
 * одновременно»: романтизм и наполеоновские войны, Просвещение
 * и Семилетняя война, правление Фридриха II и «Критика чистого разума».
 */
export function GlobeLanes({
  year,
  kb,
  kbMissing,
  bands,
  rulers,
  stateName,
  onPick,
}: {
  year: number;
  kb: Kb | null;
  kbMissing?: boolean;
  bands: TimeBand[];
  rulers: Ruler[] | null;
  stateName: string | null;
  onPick: (bar: LaneBar) => void;
}) {
  const span = spanFor(year);
  const from = year - span;
  const to = year + span;

  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const lanes = useMemo<Lane[]>(() => {
    const overlaps = (f: number, t: number) => f <= to && t >= from;
    const result: Lane[] = [];

    const vaultBars = bands
      .filter((b) => overlaps(b.from, b.to))
      .map<LaneBar>((b) => ({ id: b.id, title: b.title, from: b.from, to: b.to, color: '#7fc8a9', target: { kind: 'note', id: b.id } }));
    const periodBars = kb
      ? Object.entries(kb.items)
          .filter(([, i]) => i.t === 'period' && i.f !== undefined && i.e !== undefined && overlaps(i.f, i.e))
          .slice(0, 40)
          .map<LaneBar>(([id, i]) => ({ id, title: i.n, from: i.f!, to: i.e!, color: '#a9b1d6', target: { kind: 'kb', id } }))
      : [];
    result.push({ key: 'epochs', title: 'Эпохи', bars: [...vaultBars, ...activeFirst(periodBars, year)] });

    if (kb) {
      const movements = Object.entries(kb.items)
        .filter(([, i]) => i.t === 'movement' && i.f !== undefined)
        .map(([id, i]) => ({ id, i, end: i.e ?? Math.min(i.f! + 40, 2024) }))
        .filter(({ i, end }) => overlaps(i.f!, end))
        .slice(0, 60)
        .map<LaneBar>(({ id, i, end }) => ({
          id,
          title: i.n,
          from: i.f!,
          to: end,
          color: KIND_COLORS[i.k ?? ''] ?? '#a9b1d6',
          target: { kind: 'kb', id },
        }));
      result.push({ key: 'movements', title: 'Течения', bars: activeFirst(movements, year) });

      const wars = Object.entries(kb.items)
        .filter(([, i]) => i.t === 'war' && i.f !== undefined)
        .map(([id, i]) => ({ id, i, end: i.e ?? i.f! }))
        // Серии войн на века («русско-турецкие войны», 1568—1918) — это рубрика,
        // а не война: на ленте они заняли бы целый ряд. Крестовые походы (196 лет) остаются
        .filter(({ i, end }) => overlaps(i.f!, end) && end - i.f! <= MAX_WAR_YEARS)
        .slice(0, 60)
        .map<LaneBar>(({ id, i, end }) => ({ id, title: i.n, from: i.f!, to: end, color: '#e5484d', target: { kind: 'kb', id } }));
      result.push({ key: 'wars', title: 'Войны', bars: activeFirst(wars, year) });
    }

    if (rulers && stateName) {
      const bars = rulers
        .filter((r) => overlaps(r[1], r[2] ?? r[1]))
        .map<LaneBar>((r) => ({
          id: `${r[3]}-${r[1]}`,
          title: r[0],
          from: r[1],
          to: r[2] ?? r[1],
          color: '#f7768e',
          target: { kind: 'ruler', id: r[3] },
        }));
      result.push({ key: 'rulers', title: `Правители · ${stateName}`, bars });
    }
    return result.filter((lane) => lane.bars.length > 0);
  }, [kb, bands, rulers, stateName, from, to, year]);

  const x = (y: number) => ((Math.max(from, Math.min(to, y)) - from) / (to - from)) * width;

  return (
    <div className="pointer-events-auto mx-auto mb-2 max-h-[38vh] max-w-3xl overflow-y-auto rounded-xl border border-border/50 bg-card/92 px-3 py-2 backdrop-blur-sm">
      <div ref={box} className="relative">
        <div className="mb-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>{formatYear(from)}</span>
          <span className="font-medium text-foreground">{formatYear(year)}</span>
          <span>{formatYear(to)}</span>
        </div>
        {/* Выбранный год — вертикальной чертой через все ленты */}
        <div className="pointer-events-none absolute bottom-0 top-4 z-10 w-px bg-foreground/50" style={{ left: '50%' }} aria-hidden />
        {!kb && (
          <p className="py-2 text-[12px] text-muted-foreground">
            {kbMissing ? 'База знаний не собрана — течения и войны появятся после pnpm kb.' : 'Загружаю течения, войны и эпохи…'}
          </p>
        )}
        {lanes.map((lane) => {
          const rows = pack(lane.bars, x, width);
          return (
            <div key={lane.key} className="mb-1.5">
              <p className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{lane.title}</p>
              <div className="relative overflow-hidden" style={{ height: rows.length * ROW_HEIGHT }}>
                {rows.map((row, r) =>
                  row.map(({ bar, x: left, span: barWidth, extent }) => (
                    <button
                      key={bar.id}
                      type="button"
                      onClick={() => onPick(bar)}
                      title={`${bar.title}: ${formatYear(bar.from)} — ${formatYear(bar.to)}`}
                      className={cn(
                        'group absolute h-[15px] whitespace-nowrap text-left text-[10.5px] leading-[15px] text-foreground transition-opacity hover:opacity-100',
                        bar.from <= year && year <= bar.to ? 'opacity-100' : 'opacity-70'
                      )}
                      style={{ top: r * ROW_HEIGHT, left, width: extent }}
                    >
                      <span
                        className="absolute inset-y-0 left-0 rounded-sm group-hover:brightness-110"
                        style={{ width: barWidth, background: `${bar.color}55`, boxShadow: `inset 3px 0 0 ${bar.color}` }}
                        aria-hidden
                      />
                      <span className="relative block overflow-hidden text-ellipsis px-1">{bar.title}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
