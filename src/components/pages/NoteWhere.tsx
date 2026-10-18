import { lazy, Suspense, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Globe2 } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { placesForGraph, type Place } from '@/arche/geo';
import { polityOfPlace } from '@/arche/sovereignty';
import type { SovereigntySegment } from '@/arche/bordersData';
import { formatYear } from '@/arche/timeSpan';
import { Button } from '@/components/ui/button';
import type { ArcheNote } from '@/arche/types';

// Карта тянет d3-geo и очертания суши — текст страницы её не ждёт
const BordersMiniMap = lazy(() =>
  import('@/components/globe/BordersMiniMap').then((m) => ({ default: m.BordersMiniMap }))
);

const MAP_HEIGHT = 240;

/** «Королевство Пруссия», «Мелкие государства СРИ, в составе: Священная Римская империя» */
export function PolityLabel({ segment }: { segment: SovereigntySegment }) {
  const name = segment.ru ?? segment.n;
  return (
    <>
      {segment.src === 'bg' ? <>здесь жили: {name}</> : <span className="text-foreground">{name}</span>}
      {segment.u && <>, в составе: {segment.u.ru}</>}
      {segment.near && (
        <span title="Город стоит у края упрощённой границы — принадлежность определена по ближайшему государству">
          {' '}
          (у границы)
        </span>
      )}
    </>
  );
}

interface Row {
  place: Place;
  at: SovereigntySegment | null;
  /** У персоны — на год смерти, если государство сменилось */
  end: SovereigntySegment | null;
}

/**
 * Где и когда: место заметки и чьей землёй оно было в её год.
 *
 * «Кант, Кёнигсберг» — это ещё не картина. «Кёнигсберг, Королевство
 * Пруссия, 1781» — уже да: видно, при каком государе, в какой стране
 * и в каких границах написана «Критика». Строка считается сама, из
 * места заметки, её года и исторических границ.
 */
export function NoteWhere({ note }: { note: ArcheNote }) {
  const notes = useArcheStore((s) => s.notes);
  const graph = useArcheStore((s) => s.knowledgeGraph);

  const data = useMemo(() => {
    const places = placesForGraph(notes, graph).placesOf.get(note.id) ?? [];
    const time = graph.nodeById.get(note.id)?.time;
    if (places.length === 0 || !time) return null;

    const year = time.displayYear;
    const endYear = note.type === 'person' ? time.endYear : undefined;
    const rows: Row[] = places.map((place) => {
      const at = place.geo.scale === 'city' ? polityOfPlace(place.id, year) : null;
      const end = endYear !== undefined && place.geo.scale === 'city' ? polityOfPlace(place.id, endYear) : null;
      return { place, at, end: end && end.ru !== at?.ru ? end : null };
    });
    return { year, endYear, rows };
  }, [notes, graph, note.id, note.type]);

  if (!data) return null;
  const { year, endYear, rows } = data;
  const highlight = rows.find((r) => r.at && r.at.src !== 'bg')?.at?.k ?? null;
  const firstCity = rows.find((r) => r.place.geo.scale === 'city') ?? rows[0];

  return (
    <section className="space-y-4 border-t border-border/30 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-2xl text-foreground/90">Где и когда</h2>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/globe?year=${Math.round(year)}&place=${encodeURIComponent(firstCity.place.id)}`}>
            <Globe2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            На глобусе
          </Link>
        </Button>
      </div>

      <ul className="space-y-1.5 text-[15px]">
        {rows.map(({ place, at, end }) => (
          <li key={place.id} className="text-muted-foreground">
            <Link to={`/note/${place.id}`} className="font-serif text-foreground hover:underline">
              {place.title}
            </Link>
            {' — '}
            {place.geo.scale === 'region' ? (
              <>регион: государство в одной точке не определяется</>
            ) : at ? (
              <>
                <PolityLabel segment={at} />, {formatYear(year)}
                {end && endYear !== undefined && (
                  <>
                    ; к {formatYear(endYear)} — <PolityLabel segment={end} />
                  </>
                )}
              </>
            ) : (
              <>в {formatYear(year)} году данных о границах здесь нет</>
            )}
          </li>
        ))}
      </ul>

      <Suspense fallback={<div className="rounded-lg border border-border/40" style={{ height: MAP_HEIGHT }} />}>
        <BordersMiniMap
          year={year}
          height={MAP_HEIGHT}
          highlight={highlight}
          points={rows.map(({ place }) => ({ lon: place.geo.lon, lat: place.geo.lat, label: place.title }))}
        />
      </Suspense>

      <p className="text-xs text-muted-foreground">
        Границы — реконструкция Cliopatria, упрощённая и приблизительная. Если
        здесь неверно, поправка пишется в <code>arche-vault/_borders/</code>.
      </p>
    </section>
  );
}
