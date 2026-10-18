import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { geoContains } from 'd3-geo';
import { Clock, ExternalLink, Globe2, Layers, Map as MapIcon, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { normalizeTitle } from '@/arche/normalize';
import { notesByPlace, placesForGraph } from '@/arche/geo';
import { RELATION_META } from '@/arche/relations';
import { noteTypeLabel, noteTypeMeta } from '@/arche/noteTypes';
import { formatYear } from '@/arche/timeSpan';
import {
  polityOfPlace,
  stateName,
  useBordersAt,
  wikipediaUrl,
  type StateShape,
} from '@/arche/borders';
import {
  eventsAround,
  isAlive,
  loadContext,
  peopleAlive,
  windowFor,
  withoutVaultDuplicates,
  type ContextData,
} from '@/arche/context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { plural } from '@/lib/plural';
import {
  GlobeCanvas,
  type BackgroundLayer,
  type ContextPoint,
  type GlobeArc,
  type GlobeMarker,
  type GlobeMode,
  type GlobeSelection,
  type StateLayer,
} from './GlobeCanvas';

/** За сколько секунд «проигрывается» вся история */
const PLAY_SECONDS = 40;
/** Последний год, для которого есть границы */
const PRESENT = 2024;
/** Сколько точек фона рисовать одновременно — больше превращается в сыпь */
const CONTEXT_EVENTS = 60;
const CONTEXT_PEOPLE = 50;

interface LocatedNote {
  noteId: string;
  title: string;
  type?: string;
  year: number;
  endYear?: number;
  placeIds: string[];
}

interface LayerState {
  states: boolean;
  background: boolean;
  events: boolean;
  people: boolean;
}

const LAYERS_KEY = 'arche-globe-layers';
const DEFAULT_LAYERS: LayerState = { states: true, background: true, events: true, people: true };

function readLayers(): LayerState {
  try {
    const raw = localStorage.getItem(LAYERS_KEY);
    return raw ? { ...DEFAULT_LAYERS, ...JSON.parse(raw) } : DEFAULT_LAYERS;
  } catch {
    return DEFAULT_LAYERS;
  }
}

const LAYER_LABELS: Array<{ key: keyof LayerState; label: string; hint: string }> = [
  { key: 'states', label: 'Границы', hint: 'Государства на выбранный год — Cliopatria' },
  { key: 'background', label: 'Народы', hint: 'Где государств нет — народы и культуры, приблизительно' },
  { key: 'events', label: 'События', hint: 'Сражения, договоры, соборы — из Wikidata' },
  { key: 'people', label: 'Люди', hint: 'Кто жил в это время — из Wikidata' },
];

function yearsLabel(from: number, to: number): string {
  if (to >= PRESENT) return `с ${formatYear(from)}`;
  return `${formatYear(from)} — ${formatYear(to)}`;
}

export function GlobeView() {
  const notes = useArcheStore((s) => s.notes);
  const graph = useArcheStore((s) => s.knowledgeGraph);
  const [params] = useSearchParams();

  const geo = useMemo(() => {
    const { index, placesOf } = placesForGraph(notes, graph);

    const located: LocatedNote[] = [];
    for (const [noteId, places] of placesOf) {
      const node = graph.nodeById.get(noteId);
      // Без датировки заметку некуда поставить на шкале времени
      if (!node?.time || node.type === 'place') continue;
      located.push({
        noteId,
        title: node.title,
        type: node.type,
        year: node.time.displayYear,
        endYear: node.time.endYear,
        placeIds: places.map((p) => p.id),
      });
    }

    located.sort((a, b) => a.year - b.year);
    return { index, placesOf, byPlace: notesByPlace(placesOf), located };
  }, [notes, graph]);

  /**
   * Чьей землёй было место каждой заметки в её год: Кант → Королевство
   * Пруссия. По этому индексу клик по государству находит заметки
   * внутри его границ.
   */
  const notesByPolity = useMemo(() => {
    const map = new Map<string, LocatedNote[]>();
    const add = (key: string, item: LocatedNote) => {
      const list = map.get(key) ?? [];
      if (!list.includes(item)) list.push(item);
      map.set(key, list);
    };
    for (const item of geo.located) {
      for (const placeId of item.placeIds) {
        const segment = polityOfPlace(placeId, item.year);
        if (!segment?.k) continue;
        add(segment.k, item);
        if (segment.u) add(segment.u.k, item);
      }
    }
    return map;
  }, [geo.located]);

  const bounds = useMemo(() => {
    if (geo.located.length === 0) return { min: 0, max: PRESENT };
    return { min: geo.located[0].year, max: Math.max(PRESENT, geo.located[geo.located.length - 1].year) };
  }, [geo.located]);

  const initialYear = Number(params.get('year'));
  const [year, setYear] = useState(Number.isFinite(initialYear) && params.has('year') ? initialYear : bounds.max);
  const [playing, setPlaying] = useState(false);
  const [selection, setSelection] = useState<GlobeSelection | null>(() => {
    const place = params.get('place');
    if (place) return { kind: 'place', id: place };
    const state = params.get('state');
    return state ? { kind: 'state', key: state } : null;
  });
  const [mode, setMode] = useState<GlobeMode>(params.get('mode') === 'flat' ? 'flat' : 'globe');
  const [layers, setLayers] = useState<LayerState>(readLayers);
  const [layersOpen, setLayersOpen] = useState(false);
  const [meanwhileOpen, setMeanwhileOpen] = useState(false);
  const [focus, setFocus] = useState<{ lon: number; lat: number; token: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LAYERS_KEY, JSON.stringify(layers));
    } catch {
      // Хранилище недоступно (приватный режим) — слои просто не запомнятся
    }
  }, [layers]);

  // Пришли со страницы заметки: повернуться к месту
  useEffect(() => {
    const placeId = params.get('place');
    const place = placeId ? geo.index.byId.get(placeId) : null;
    if (place) setFocus({ lon: place.geo.lon, lat: place.geo.lat, token: Date.now() });
  }, [params, geo.index.byId]);

  useEffect(() => {
    if (!params.has('year')) setYear(bounds.max);
  }, [bounds.max, params]);

  // Проигрывание истории: год ползёт от начала к концу
  useEffect(() => {
    if (!playing) return;
    const span = bounds.max - bounds.min;
    if (span <= 0) return;

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      setYear((current) => {
        const next = current + (span * delta) / PLAY_SECONDS;
        if (next >= bounds.max) {
          setPlaying(false);
          return bounds.max;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, bounds.min, bounds.max]);

  const startPlay = useCallback(() => {
    setYear(bounds.min);
    setSelection(null);
    setPlaying(true);
  }, [bounds.min]);

  const roundedYear = Math.round(year);
  const borders = useBordersAt(year, { states: layers.states, background: layers.background });

  const [context, setContext] = useState<ContextData | null>(null);
  useEffect(() => {
    if (!layers.events && !layers.people && !meanwhileOpen) return;
    let alive = true;
    loadContext().then((data) => {
      if (!alive || !data) return;
      const titles = new Set(notes.map((note) => normalizeTitle(note.title)));
      setContext(withoutVaultDuplicates(data, titles));
    });
    return () => {
      alive = false;
    };
  }, [layers.events, layers.people, meanwhileOpen, notes]);

  /** Что уже случилось к выбранному году */
  const visible = useMemo(
    () => geo.located.filter((item) => item.year <= year),
    [geo.located, year]
  );

  const markers = useMemo<GlobeMarker[]>(() => {
    const counts = new Map<string, number>();
    for (const item of visible) {
      for (const placeId of item.placeIds) {
        counts.set(placeId, (counts.get(placeId) ?? 0) + 1);
      }
    }

    const max = Math.max(1, ...counts.values());
    return geo.index.places
      .map((place) => {
        const count = counts.get(place.id) ?? 0;
        return { place, count, weight: count / max };
      })
      // Пустое место на глобусе — просто шум: пока там ничего не произошло,
      // показывать нечего
      .filter((marker) => marker.count > 0);
  }, [geo.index.places, visible]);

  const selectedPlaceId = selection?.kind === 'place' ? selection.id : null;

  const arcs = useMemo<GlobeArc[]>(() => {
    const shown = new Set(visible.map((item) => item.noteId));
    const placeOfNote = new Map<string, string>();
    for (const item of visible) placeOfNote.set(item.noteId, item.placeIds[0]);

    const byPair = new Map<string, GlobeArc>();

    for (const edge of graph.edges) {
      if (!RELATION_META[edge.kind].genealogical || edge.undirected) continue;
      if (!shown.has(edge.sourceId) || !shown.has(edge.targetId)) continue;

      const fromId = placeOfNote.get(edge.sourceId);
      const toId = placeOfNote.get(edge.targetId);
      if (!fromId || !toId || fromId === toId) continue;

      const key = `${fromId}|${toId}`;
      if (byPair.has(key)) continue;

      const from = geo.index.byId.get(fromId);
      const to = geo.index.byId.get(toId);
      if (!from || !to) continue;

      byPair.set(key, {
        fromId,
        toId,
        from: [from.geo.lon, from.geo.lat],
        to: [to.geo.lon, to.geo.lat],
        color: RELATION_META[edge.kind].color,
      });
    }

    const all = [...byPair.values()];
    // При выбранном месте показываем только его связи: иначе Европа
    // затягивается сеткой, из которой ничего не прочитать
    return selectedPlaceId
      ? all.filter((arc) => arc.fromId === selectedPlaceId || arc.toId === selectedPlaceId)
      : all;
  }, [graph.edges, visible, geo.index.byId, selectedPlaceId]);

  const stateLayers = useMemo<StateLayer[]>(
    () => borders.states.map((shape) => ({ ...shape, ru: stateName(shape, roundedYear) })),
    [borders.states, roundedYear]
  );

  const backgroundLayers = useMemo<BackgroundLayer[]>(() => borders.background, [borders.background]);

  const contextNow = useMemo(() => {
    if (!context) return { events: [], people: [] };
    return {
      events: eventsAround(context, roundedYear, CONTEXT_EVENTS),
      people: peopleAlive(context, roundedYear, CONTEXT_PEOPLE),
    };
  }, [context, roundedYear]);

  const contextPoints = useMemo<ContextPoint[]>(() => {
    if (!context) return [];
    const points: ContextPoint[] = [];
    if (layers.events) {
      for (const e of contextNow.events) {
        points.push({
          id: e.id,
          kind: 'event',
          lon: e.lon,
          lat: e.lat,
          title: e.title,
          sub: `${context.kinds[e.kind] ?? 'Событие'} · ${formatYear(e.year)}`,
        });
      }
    }
    if (layers.people) {
      for (const p of contextNow.people) {
        points.push({
          id: p.id,
          kind: 'person',
          lon: p.lon,
          lat: p.lat,
          title: p.title,
          sub: [p.description, p.place ? `родом из: ${p.place}` : null].filter(Boolean).join(' · '),
        });
      }
    }
    return points;
  }, [context, contextNow, layers.events, layers.people]);

  const selectedPlace = selectedPlaceId ? geo.index.byId.get(selectedPlaceId) : null;
  const selectedNotes = useMemo(() => {
    if (!selectedPlaceId) return [];
    return visible
      .filter((item) => item.placeIds.includes(selectedPlaceId))
      .sort((a, b) => a.year - b.year);
  }, [visible, selectedPlaceId]);

  const selectedState: StateShape | null = useMemo(() => {
    if (selection?.kind !== 'state') return null;
    return borders.states.find((shape) => shape.key === selection.key) ?? null;
  }, [selection, borders.states]);

  const selectedContext = useMemo(() => {
    if (selection?.kind !== 'context' || !context) return null;
    return (
      context.events.find((e) => e.id === selection.id) ??
      context.people.find((p) => p.id === selection.id) ??
      null
    );
  }, [selection, context]);

  if (geo.index.places.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground">
        В хранилище нет заметок типа <code className="mx-1">place</code> с координатами.
      </div>
    );
  }

  const panelOpen = Boolean(selectedPlace || selection?.kind === 'state' || selectedContext);

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <GlobeCanvas
        mode={mode}
        markers={markers}
        arcs={arcs}
        states={layers.states ? stateLayers : []}
        background={layers.background ? backgroundLayers : []}
        context={contextPoints}
        selection={selection}
        onSelect={(next) => {
          setSelection(next);
          if (next) setMeanwhileOpen(false);
        }}
        autoRotate={!selection && !playing}
        focus={focus}
      />

      {/* Слои и вид */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 flex max-w-full flex-col items-start gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-border/50 bg-card/85 p-1 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setMode('globe')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
              mode === 'globe' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            aria-pressed={mode === 'globe'}
          >
            <Globe2 className="h-3.5 w-3.5" aria-hidden />
            Шар
          </button>
          <button
            type="button"
            onClick={() => setMode('flat')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
              mode === 'flat' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            aria-pressed={mode === 'flat'}
          >
            <MapIcon className="h-3.5 w-3.5" aria-hidden />
            Карта
          </button>
          <span className="mx-0.5 h-4 w-px bg-border/60" aria-hidden />
          <button
            type="button"
            onClick={() => setLayersOpen((open) => !open)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
              layersOpen ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            aria-expanded={layersOpen}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden />
            Слои
          </button>
          <button
            type="button"
            onClick={() => {
              setMeanwhileOpen((open) => !open);
              setSelection(null);
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
              meanwhileOpen ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            aria-expanded={meanwhileOpen}
          >
            <Clock className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">А в это время</span>
            <span className="sm:hidden">Время</span>
          </button>
        </div>

        {layersOpen && (
          <div className="pointer-events-auto w-[260px] rounded-xl border border-border/50 bg-card/95 p-3 text-sm backdrop-blur-sm">
            <ul className="space-y-1.5">
              {LAYER_LABELS.map(({ key, label, hint }) => (
                <li key={key}>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={layers[key]}
                      onChange={(e) => setLayers((current) => ({ ...current, [key]: e.target.checked }))}
                      className="mt-0.5 accent-primary"
                    />
                    <span>
                      <span className="block leading-tight">{label}</span>
                      <span className="block text-[11px] leading-snug text-muted-foreground">{hint}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-border/40 pt-2 text-[11px] leading-snug text-muted-foreground">
              Границы — реконструкция, а не съёмка: упрощены и приблизительны,
              особенно в древности.{' '}
              <a
                href="https://github.com/Seshat-Global-History-Databank/cliopatria"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                Cliopatria
              </a>{' '}
              (CC BY 4.0),{' '}
              <a
                href="https://github.com/aourednik/historical-basemaps"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                historical-basemaps
              </a>{' '}
              (GPL-3.0),{' '}
              <a
                href="https://www.wikidata.org/"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                Wikidata
              </a>{' '}
              (CC0).
            </p>
          </div>
        )}
      </div>

      {/* Год и проигрывание: при открытой панели — левее неё, а не под ней */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 sm:p-4',
          (panelOpen || meanwhileOpen) && 'sm:right-[380px]'
        )}
      >
        <div className="pointer-events-auto mx-auto flex max-w-2xl items-center gap-3 rounded-xl border border-border/50 bg-card/85 px-3 py-2.5 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => (playing ? setPlaying(false) : startPlay())}
            aria-label={playing ? 'Остановить' : 'Проиграть историю'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium tabular-nums text-foreground">
                {formatYear(roundedYear)}
              </span>
              <span className="truncate text-muted-foreground">
                {visible.length} из {geo.located.length} заметок
                {layers.states && borders.states.length > 0 && (
                  <> · {borders.states.filter((s) => !s.union).length}{' '}
                    {plural(borders.states.filter((s) => !s.union).length, 'государство', 'государства', 'государств')}</>
                )}
              </span>
            </div>
            <input
              type="range"
              min={bounds.min}
              max={bounds.max}
              step={1}
              value={roundedYear}
              onChange={(e) => {
                setPlaying(false);
                setYear(Number(e.target.value));
              }}
              aria-label="Год"
              className="mt-1.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-border/60 accent-primary"
            />
          </div>

          {year < bounds.max && (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => {
                setPlaying(false);
                setYear(bounds.max);
              }}
              aria-label="Показать всё время"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Боковая панель: выбранное или «а в это время» */}
      {(panelOpen || meanwhileOpen) && (
        <aside
          className={cn(
            'absolute inset-x-0 bottom-0 z-20 flex max-h-[62%] flex-col border-t border-border/60',
            'bg-card/95 backdrop-blur-sm',
            'sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[380px] sm:border-l sm:border-t-0'
          )}
        >
          {selectedPlace ? (
            <PlacePanel
              title={selectedPlace.title}
              placeId={selectedPlace.id}
              isRegion={selectedPlace.geo.scale === 'region'}
              year={roundedYear}
              notes={selectedNotes}
              onClose={() => setSelection(null)}
              onSelectState={(key) => setSelection({ kind: 'state', key })}
            />
          ) : selection?.kind === 'state' ? (
            <StatePanel
              shape={selectedState}
              year={roundedYear}
              notes={notesByPolity.get(selection.key) ?? []}
              unions={
                selectedState
                  ? borders.states.filter(
                      (shape) =>
                        shape.union &&
                        stateName(shape, roundedYear) !== stateName(selectedState, roundedYear) &&
                        geoContains(shape.area, selectedState.label)
                    )
                  : []
              }
              onClose={() => setSelection(null)}
            />
          ) : selectedContext && context ? (
            <ContextPanel
              item={selectedContext}
              context={context}
              onClose={() => setSelection(null)}
            />
          ) : (
            <MeanwhilePanel
              year={roundedYear}
              located={geo.located}
              states={borders.states}
              context={context}
              onSelect={(next) => {
                setSelection(next);
                setMeanwhileOpen(false);
              }}
              onClose={() => setMeanwhileOpen(false)}
            />
          )}
        </aside>
      )}
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-border/40 p-4">
      <div className="min-w-0">
        <h2 className="font-serif text-2xl leading-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть">
        <X className="h-4 w-4" />
      </Button>
    </header>
  );
}

function NoteList({ items, year }: { items: LocatedNote[]; year?: number }) {
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.noteId}>
          <Link
            to={`/note/${item.noteId}`}
            className={cn(
              'flex items-baseline gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50',
              year !== undefined && item.year > year && 'opacity-50'
            )}
          >
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: noteTypeMeta(item.type).graphColor }}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block font-serif text-[15px] leading-snug">{item.title}</span>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {noteTypeLabel(item.type)} · {formatYear(item.year)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PlacePanel({
  title,
  placeId,
  isRegion,
  year,
  notes,
  onClose,
  onSelectState,
}: {
  title: string;
  placeId: string;
  isRegion: boolean;
  year: number;
  notes: LocatedNote[];
  onClose: () => void;
  onSelectState: (key: string) => void;
}) {
  const polity = isRegion ? null : polityOfPlace(placeId, year);

  return (
    <>
      <PanelHeader
        title={title}
        subtitle={
          <>
            {isRegion ? 'Регион' : 'Город'} · {notes.length}{' '}
            {plural(notes.length, 'заметка', 'заметки', 'заметок')}
          </>
        }
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Button variant="outline" size="sm" asChild className="mb-4">
          <Link to={`/note/${placeId}`}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            О месте
          </Link>
        </Button>

        {polity && (
          <p className="mb-4 text-sm">
            <span className="text-muted-foreground">В {formatYear(year)} году — </span>
            {polity.src === 'bg' ? (
              <span>{polity.ru ?? polity.n}</span>
            ) : (
              <button
                type="button"
                onClick={() => onSelectState(polity.k!)}
                className="font-medium underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                {polity.ru ?? polity.n}
              </button>
            )}
            {polity.u && <span className="text-muted-foreground">, в составе: {polity.u.ru}</span>}
          </p>
        )}

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            К этому году здесь ещё ничего не произошло.
          </p>
        ) : (
          <NoteList items={notes} />
        )}
      </div>
    </>
  );
}

function StatePanel({
  shape,
  year,
  notes,
  unions,
  onClose,
}: {
  shape: StateShape | null;
  year: number;
  notes: LocatedNote[];
  unions: StateShape[];
  onClose: () => void;
}) {
  if (!shape) {
    return (
      <>
        <PanelHeader title="Государство" onClose={onClose} />
        <p className="p-4 text-sm text-muted-foreground">
          В {formatYear(year)} году этого государства на карте нет. Сдвиньте год
          или выберите другое.
        </p>
      </>
    );
  }

  const ru = stateName(shape, year);
  const polity = shape.polity;
  const from = polity?.f ?? shape.patch?.from ?? shape.from;
  const to = polity?.t ?? shape.patch?.to ?? shape.to;
  const wiki = wikipediaUrl({
    ru: polity?.rw ?? shape.patch?.ruwiki,
    en: polity?.w ?? shape.patch?.wikipedia,
  });
  const wikidata = polity?.q ?? shape.patch?.wikidata;
  const sorted = [...notes].sort((a, b) => a.year - b.year);

  return (
    <>
      <PanelHeader
        title={ru}
        subtitle={
          <>
            {shape.name !== ru && <span className="italic">{shape.name}</span>}
            {shape.name !== ru && ' · '}
            {yearsLabel(from, to)}
          </>
        }
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        {unions.length > 0 && (
          <p>
            <span className="text-muted-foreground">В составе: </span>
            {unions.map((u) => stateName(u, year)).join(', ')}
          </p>
        )}

        <p className="text-muted-foreground">
          Границы на {formatYear(year)} год действуют в наборе с{' '}
          {formatYear(shape.from)} по {formatYear(shape.to)}.{' '}
          {shape.source === 'patch'
            ? 'Поправка хранилища: в Cliopatria этого здесь нет или оно неверно.'
            : 'По данным Cliopatria — приблизительно.'}
        </p>

        {shape.patch?.note && (
          <p className="rounded-lg border border-border/40 bg-muted/30 p-3 text-[13px] leading-relaxed">
            {shape.patch.note}
          </p>
        )}

        {(wiki || wikidata) && (
          <div className="flex flex-wrap gap-2">
            {wiki && (
              <Button variant="outline" size="sm" asChild>
                <a href={wiki} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Википедия
                </a>
              </Button>
            )}
            {wikidata && (
              <Button variant="ghost" size="sm" asChild>
                <a href={`https://www.wikidata.org/wiki/${wikidata}`} target="_blank" rel="noreferrer">
                  Wikidata
                </a>
              </Button>
            )}
          </div>
        )}

        <section>
          <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            Заметки в этих границах
          </h3>
          {sorted.length === 0 ? (
            <p className="text-muted-foreground">
              Ни одна заметка хранилища не происходила здесь, пока существовало это государство.
            </p>
          ) : (
            <NoteList items={sorted} year={year} />
          )}
        </section>
      </div>
    </>
  );
}

function ContextPanel({
  item,
  context,
  onClose,
}: {
  item: ContextData['events'][number] | ContextData['people'][number];
  context: ContextData;
  onClose: () => void;
}) {
  const isPerson = 'birth' in item;
  const wiki = wikipediaUrl(item);

  return (
    <>
      <PanelHeader
        title={item.title}
        subtitle={
          isPerson
            ? `${context.groups[item.group] ?? 'Человек'} · ${formatYear(item.birth)}${item.death ? ` — ${formatYear(item.death)}` : ''}`
            : `${context.kinds[item.kind] ?? 'Событие'} · ${formatYear(item.year)}`
        }
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        {item.description && <p className="leading-relaxed">{item.description}</p>}
        {item.place && (
          <p className="text-muted-foreground">
            {isPerson ? 'Родом из: ' : 'Где: '}
            {item.place}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {wiki && (
            <Button variant="outline" size="sm" asChild>
              <a href={wiki} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Википедия
              </a>
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <a href={`https://www.wikidata.org/wiki/${item.id}`} target="_blank" rel="noreferrer">
              Wikidata
            </a>
          </Button>
        </div>
        <p className="border-t border-border/40 pt-3 text-[12px] leading-relaxed text-muted-foreground">
          Это фон из Wikidata, а не заметка хранилища: только название, год
          и место. Если тема стоит того — заметку можно написать.
        </p>
      </div>
    </>
  );
}

/** Сколько строк в каждом разделе «а в это время» */
const MEANWHILE_LIMIT = 8;

function MeanwhilePanel({
  year,
  located,
  states,
  context,
  onSelect,
  onClose,
}: {
  year: number;
  located: LocatedNote[];
  states: StateShape[];
  context: ContextData | null;
  onSelect: (selection: GlobeSelection) => void;
  onClose: () => void;
}) {
  const span = windowFor(year);

  // Своё — первым: заметки, которые идут в этот год или рядом с ним
  const ours = located
    .filter((item) => {
      const end = item.endYear ?? item.year;
      return item.year - span <= year && year <= end + span;
    })
    .sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year))
    .slice(0, MEANWHILE_LIMIT * 2);

  const largest = states
    .filter((s) => !s.union)
    .sort((a, b) => b.size - a.size)
    .filter((s, i, all) => all.findIndex((o) => o.key === s.key) === i)
    .slice(0, MEANWHILE_LIMIT);

  const events = context ? eventsAround(context, year, MEANWHILE_LIMIT) : [];
  const people = context
    ? context.people.filter((p) => isAlive(p, year)).slice(0, MEANWHILE_LIMIT)
    : [];

  return (
    <>
      <PanelHeader
        title="А в это время"
        subtitle={`${formatYear(year)} год, ± ${span} ${plural(span, 'год', 'года', 'лет')}`}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 text-sm">
        <section>
          <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            В хранилище
          </h3>
          {ours.length === 0 ? (
            <p className="text-muted-foreground">Ни одной заметки об этом времени.</p>
          ) : (
            <NoteList items={ours} />
          )}
        </section>

        {largest.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              Крупнейшие государства
            </h3>
            <ul className="space-y-0.5">
              {largest.map((shape) => (
                <li key={shape.key}>
                  <button
                    type="button"
                    onClick={() => onSelect({ kind: 'state', key: shape.key })}
                    className="w-full rounded-md px-2 py-1 text-left hover:bg-accent/50"
                  >
                    {stateName(shape, year)}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {events.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              События
            </h3>
            <ul className="space-y-0.5">
              {events.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ kind: 'context', id: e.id })}
                    className="w-full rounded-md px-2 py-1 text-left hover:bg-accent/50"
                  >
                    <span className="block leading-snug">{e.title}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatYear(e.year)}
                      {e.place && ` · ${e.place}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {people.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              Жили в это время
            </h3>
            <ul className="space-y-0.5">
              {people.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ kind: 'context', id: p.id })}
                    className="w-full rounded-md px-2 py-1 text-left hover:bg-accent/50"
                  >
                    <span className="block leading-snug">{p.title}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatYear(p.birth)}
                      {p.death ? ` — ${formatYear(p.death)}` : ''}
                      {p.description && ` · ${p.description}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!context && (
          <p className="text-[12px] text-muted-foreground">
            Фон из Wikidata не загружен — события и люди появятся после <code>pnpm context</code>.
          </p>
        )}
      </div>
    </>
  );
}
