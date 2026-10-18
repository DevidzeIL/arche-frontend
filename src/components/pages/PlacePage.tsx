import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe2 } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { notesByPlace, placesForGraph } from '@/arche/geo';
import { polityOfPlace, sovereigntyTimeline } from '@/arche/sovereignty';
import { formatYear } from '@/arche/timeSpan';
import { noteTypeLabel, noteTypeMeta } from '@/arche/noteTypes';
import { MarkdownViewer } from '@/arche/markdown/components';
import { bodyForDisplay } from '@/arche/excerpt';
import { Button } from '@/components/ui/button';
import { TypeBadge } from '@/components/museum';
import { cn } from '@/lib/utils';
import type { ArcheNote } from '@/arche/types';
import { NoteConnections } from './NoteConnections';
import { PolityLabel } from './NoteWhere';
import { PlaceContext } from './PlaceContext';
import { NoteKnowledge } from './NoteKnowledge';

const BordersMiniMap = lazy(() =>
  import('@/components/globe/BordersMiniMap').then((m) => ({ default: m.BordersMiniMap }))
);

const MAP_HEIGHT = 280;
/** Последний год, для которого есть границы */
const PRESENT = 2024;

interface PlacePageProps {
  note: ArcheNote;
}

interface PlaceEvent {
  noteId: string;
  title: string;
  type?: string;
  year: number;
}

/**
 * Страница места: текст заметки и то, чего в тексте нет, — чьей землёй
 * был город в каждый век и что из хранилища здесь происходило.
 *
 * Кёнигсберг за пятьсот лет сменил полдюжины государств, и это не
 * справочная мелочь: Кант жил в Пруссии, в которой Кёнигсберг был
 * отрезан от Берлина польскими землями, а в Семилетнюю войну город
 * четыре года был русским — прошение о профессуре Кант писал на имя
 * императрицы Елизаветы.
 */
export function PlacePage({ note }: PlacePageProps) {
  const navigate = useNavigate();
  const notes = useArcheStore((s) => s.notes);
  const graph = useArcheStore((s) => s.knowledgeGraph);

  const { place, events } = useMemo(() => {
    const { index, placesOf } = placesForGraph(notes, graph);
    const place = index.byId.get(note.id) ?? null;
    const ids = notesByPlace(placesOf).get(note.id) ?? [];
    const events: PlaceEvent[] = [];
    for (const id of ids) {
      const node = graph.nodeById.get(id);
      if (id === note.id || !node?.time) continue;
      events.push({ noteId: id, title: node.title, type: node.type, year: node.time.displayYear });
    }
    events.sort((a, b) => a.year - b.year);
    return { place, events };
  }, [notes, graph, note.id]);

  const timeline = useMemo(() => sovereigntyTimeline(note.id), [note.id]);
  const isCity = place?.geo.scale === 'city' && timeline.length > 0;

  // По умолчанию — год первой заметки хранилища: ради неё место и заведено
  const [year, setYear] = useState(() => Math.round(events[0]?.year ?? PRESENT));
  const current = isCity ? polityOfPlace(note.id, year) : null;

  return (
    <div className="h-full w-full overflow-y-auto bg-background">
      <div className="container mx-auto max-w-4xl px-6 py-12 lg:px-12">
        <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-2 mb-8">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Назад
        </Button>

        <article className="space-y-10">
          <header className="space-y-3 border-b border-border/30 pb-8">
            <div className="flex items-start justify-between gap-4">
              <h1 className="min-w-0 break-words font-serif text-3xl font-light leading-tight text-foreground/95 sm:text-4xl lg:text-5xl">
                {note.title}
              </h1>
              <TypeBadge type={note.type} />
            </div>
            {place && (
              <p className="text-sm text-muted-foreground">
                {place.geo.scale === 'region' ? 'Регион' : 'Город'} ·{' '}
                {place.geo.lat.toFixed(2)}°, {place.geo.lon.toFixed(2)}°
              </p>
            )}
          </header>

          <div className="prose prose-lg max-w-none dark:prose-invert">
            <div className="space-y-6 text-base leading-relaxed">
              <MarkdownViewer content={bodyForDisplay(note)} />
            </div>
          </div>

          {place && (
            <section className="space-y-4 border-t border-border/30 pt-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-serif text-2xl text-foreground/90">Чья это земля</h2>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/globe?year=${year}&place=${encodeURIComponent(note.id)}`}>
                    <Globe2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    На глобусе
                  </Link>
                </Button>
              </div>

              {isCity ? (
                <>
                  <p className="text-[15px] text-muted-foreground">
                    В {formatYear(year)} году —{' '}
                    {current ? <PolityLabel segment={current} /> : 'данных о границах нет'}.
                    Выберите строку, чтобы увидеть границы того времени.
                  </p>

                  <Suspense fallback={<div className="rounded-lg border border-border/40" style={{ height: MAP_HEIGHT }} />}>
                    <BordersMiniMap
                      year={year}
                      height={MAP_HEIGHT}
                      highlight={current?.src !== 'bg' ? current?.k : null}
                      points={[{ lon: place.geo.lon, lat: place.geo.lat, label: note.title }]}
                    />
                  </Suspense>

                  <ol className="divide-y divide-border/30 text-sm">
                    {timeline.map((segment) => {
                      const inside = events.filter((e) => segment.f <= e.year && e.year <= segment.t);
                      const active = segment.f <= year && year <= segment.t;
                      return (
                        <li key={`${segment.f}-${segment.k}`}>
                          <button
                            type="button"
                            onClick={() => setYear(Math.round(inside[0]?.year ?? Math.max(segment.f, Math.min(segment.t, year))))}
                            className={cn(
                              'grid w-full grid-cols-[7.5rem_1fr] gap-3 px-2 py-1.5 text-left transition-colors hover:bg-accent/40 sm:grid-cols-[11.5rem_1fr]',
                              active && 'bg-accent/60'
                            )}
                          >
                            <span className="tabular-nums text-muted-foreground">
                              {formatYear(segment.f)}
                              {segment.t !== segment.f && <> — {segment.t >= PRESENT ? 'наши дни' : formatYear(segment.t)}</>}
                            </span>
                            <span className={cn(segment.k ? 'text-muted-foreground' : 'text-muted-foreground/50')}>
                              {segment.k ? <PolityLabel segment={segment} /> : 'нет данных'}
                              {segment.src === 'patch' && (
                                <span className="ml-1.5 text-[11px] uppercase tracking-wider">поправка</span>
                              )}
                              {inside.length > 0 && (
                                <span className="mt-0.5 block font-serif text-foreground">
                                  {inside.map((e) => e.title).join(', ')}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>

                  <p className="text-xs text-muted-foreground">
                    Cliopatria (CC BY 4.0) — государства; где их нет, historical-basemaps
                    (GPL-3.0) — народы и культуры. Реконструкция приблизительная;
                    поправки — в <code>arche-vault/_borders/</code>.
                  </p>
                </>
              ) : (
                <p className="text-[15px] text-muted-foreground">
                  Это регион, а не город: у «{note.title}» нет одной точки, и сказать,
                  какому государству «он» принадлежал, значило бы ответить про
                  условный центр на карте. Чья была земля — смотрите у городов внутри.
                </p>
              )}
            </section>
          )}

          {events.length > 0 && (
            <section className="space-y-3 border-t border-border/30 pt-8">
              <h2 className="font-serif text-2xl text-foreground/90">Что здесь было</h2>
              <ul className="space-y-1">
                {events.map((e) => {
                  const polity = isCity ? polityOfPlace(note.id, e.year) : null;
                  return (
                    <li key={e.noteId}>
                      <Link
                        to={`/note/${e.noteId}`}
                        className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50"
                      >
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: noteTypeMeta(e.type).graphColor }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-serif text-[15px] leading-snug">{e.title}</span>
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            {noteTypeLabel(e.type)} · {formatYear(e.year)}
                            {polity && polity.src !== 'bg' && <> · {polity.ru ?? polity.n}</>}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {place && isCity && <PlaceContext lat={place.geo.lat} lon={place.geo.lon} />}

          <NoteKnowledge note={note} />

          <NoteConnections note={note} />
        </article>
      </div>
    </div>
  );
}
