import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { buildPlaceIndex, resolveAllPlaces, notesByPlace } from '@/arche/geo';
import { RELATION_META } from '@/arche/relations';
import { noteTypeLabel, noteTypeMeta } from '@/arche/noteTypes';
import { formatYear } from '@/arche/timeSpan';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { plural } from '@/lib/plural';
import { GlobeCanvas, type GlobeArc, type GlobeMarker } from './GlobeCanvas';

/** За сколько секунд «проигрывается» вся история */
const PLAY_SECONDS = 24;

interface LocatedNote {
  noteId: string;
  title: string;
  type?: string;
  year: number;
  placeIds: string[];
}

export function GlobeView() {
  const notes = useArcheStore((s) => s.notes);
  const graph = useArcheStore((s) => s.knowledgeGraph);

  const geo = useMemo(() => {
    const index = buildPlaceIndex(notes);
    const placesOf = resolveAllPlaces(notes, index, (noteId) =>
      (graph.adjacent.get(noteId) ?? [])
        .filter((edge) => edge.kind === 'author')
        .map((edge) => (edge.sourceId === noteId ? edge.targetId : edge.sourceId))
        .filter((id) => graph.nodeById.get(id)?.type === 'person')
    );

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
        placeIds: places.map((p) => p.id),
      });
    }

    located.sort((a, b) => a.year - b.year);
    return { index, placesOf, byPlace: notesByPlace(placesOf), located };
  }, [notes, graph]);

  const bounds = useMemo(() => {
    if (geo.located.length === 0) return { min: 0, max: 0 };
    return {
      min: geo.located[0].year,
      max: geo.located[geo.located.length - 1].year,
    };
  }, [geo.located]);

  const [year, setYear] = useState(bounds.max);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => setYear(bounds.max), [bounds.max]);

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
    setSelectedId(null);
    setPlaying(true);
  }, [bounds.min]);

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
    return selectedId
      ? all.filter((arc) => arc.fromId === selectedId || arc.toId === selectedId)
      : all;
  }, [graph.edges, visible, geo.index.byId, selectedId]);

  const selected = selectedId ? geo.index.byId.get(selectedId) : null;
  const selectedNotes = useMemo(() => {
    if (!selectedId) return [];
    return visible
      .filter((item) => item.placeIds.includes(selectedId))
      .sort((a, b) => a.year - b.year);
  }, [visible, selectedId]);

  if (geo.index.places.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground">
        В хранилище нет заметок типа <code className="mx-1">place</code> с координатами.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <GlobeCanvas
        markers={markers}
        arcs={arcs}
        selectedId={selectedId}
        onSelect={setSelectedId}
        autoRotate={!selectedId && !playing}
      />

      {/* Год и проигрывание */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 sm:p-4">
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
                {formatYear(Math.round(year))}
              </span>
              <span className="truncate text-muted-foreground">
                {visible.length} из {geo.located.length} на карте
              </span>
            </div>
            <input
              type="range"
              min={bounds.min}
              max={bounds.max}
              step={1}
              value={Math.round(year)}
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

      {/* Что произошло в выбранном месте */}
      {selected && (
        <aside
          className={cn(
            'absolute inset-x-0 bottom-0 z-20 flex max-h-[62%] flex-col border-t border-border/60',
            'bg-card/95 backdrop-blur-sm',
            'sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[380px] sm:border-l sm:border-t-0'
          )}
          aria-label={`Что произошло: ${selected.title}`}
        >
          <header className="flex items-start justify-between gap-3 border-b border-border/40 p-4">
            <div className="min-w-0">
              <h2 className="font-serif text-2xl leading-tight">{selected.title}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {selected.geo.scale === 'region' ? 'Регион' : 'Город'} ·{' '}
                {selectedNotes.length}{' '}
                {plural(selectedNotes.length, 'заметка', 'заметки', 'заметок')}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedId(null)}
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <Button variant="outline" size="sm" asChild className="mb-4">
              <Link to={`/note/${selected.id}`}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                О месте
              </Link>
            </Button>

            {selectedNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                К этому году здесь ещё ничего не произошло.
              </p>
            ) : (
              <ul className="space-y-1">
                {selectedNotes.map((item) => (
                  <li key={item.noteId}>
                    <Link
                      to={`/note/${item.noteId}`}
                      className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50"
                    >
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: noteTypeMeta(item.type).graphColor }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-serif text-[15px] leading-snug">
                          {item.title}
                        </span>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          {noteTypeLabel(item.type)} · {formatYear(item.year)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
