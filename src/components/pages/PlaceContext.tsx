import { useEffect, useMemo, useState } from 'react';
import { useArcheStore } from '@/arche/state/store';
import { normalizeTitle } from '@/arche/normalize';
import { loadContext, withoutVaultDuplicates, type ContextData } from '@/arche/context';
import { wikipediaUrl } from '@/arche/sovereignty';
import { formatYear } from '@/arche/timeSpan';

/** Что считать «здесь»: город с пригородами, но не соседний город */
const RADIUS_KM = 30;
const LIMIT = 12;

/** Расстояние по большому кругу без d3: странице места незачем тянуть его ради одной формулы */
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/**
 * Кто ещё здесь родился и что здесь происходило — из фона Wikidata.
 *
 * Заметка о Кёнигсберге написана ради Канта, но город — это ещё Гофман,
 * Гаман и Кольвиц. Писать о них заметки не обязательно; знать, что они
 * отсюда, — полезно. Только названия, годы и ссылки, как и на глобусе.
 */
export function PlaceContext({ lat, lon }: { lat: number; lon: number }) {
  const notes = useArcheStore((s) => s.notes);
  const [context, setContext] = useState<ContextData | null>(null);

  useEffect(() => {
    let alive = true;
    loadContext().then((data) => {
      if (!alive || !data) return;
      setContext(withoutVaultDuplicates(data, new Set(notes.map((n) => normalizeTitle(n.title)))));
    });
    return () => {
      alive = false;
    };
  }, [notes]);

  const nearby = useMemo(() => {
    if (!context) return null;
    const near = (p: { lat: number; lon: number }) => distanceKm(lat, lon, p.lat, p.lon) <= RADIUS_KM;
    // Сначала самые известные, потом — по времени: так список читается как история города
    const people = context.people.filter(near).slice(0, LIMIT).sort((a, b) => a.birth - b.birth);
    const events = context.events.filter(near).slice(0, LIMIT).sort((a, b) => a.year - b.year);
    return { people, events };
  }, [context, lat, lon]);

  if (!nearby || (nearby.people.length === 0 && nearby.events.length === 0)) return null;

  return (
    <section className="space-y-4 border-t border-border/30 pt-8">
      <h2 className="font-serif text-2xl text-foreground/90">Ещё отсюда</h2>
      <div className="grid gap-6 md:grid-cols-2">
        {nearby.people.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              Родились здесь
            </h3>
            <ul className="space-y-1.5 text-sm">
              {nearby.people.map((p) => {
                const url = wikipediaUrl(p);
                return (
                  <li key={p.id}>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
                        {p.title}
                      </a>
                    ) : (
                      p.title
                    )}
                    <span className="text-muted-foreground">
                      {' '}
                      · {formatYear(p.birth)}
                      {p.death ? `–${formatYear(p.death)}` : ''}
                    </span>
                    {p.description && (
                      <span className="block text-[12.5px] text-muted-foreground">{p.description}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {nearby.events.length > 0 && context && (
          <div>
            <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              Что здесь происходило
            </h3>
            <ul className="space-y-1.5 text-sm">
              {nearby.events.map((e) => {
                const url = wikipediaUrl(e);
                return (
                  <li key={e.id}>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
                        {e.title}
                      </a>
                    ) : (
                      e.title
                    )}
                    <span className="text-muted-foreground">
                      {' '}
                      · {formatYear(e.year)}
                      {e.end ? `–${formatYear(e.end)}` : ''}
                    </span>
                    <span className="block text-[12.5px] text-muted-foreground">
                      {context.kinds[e.kind] ?? 'Событие'}
                      {e.description ? ` · ${e.description}` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Из Wikidata (CC0): не заметки хранилища, а справка — кто и что ещё связано с этим местом.
      </p>
    </section>
  );
}

/** «Рядом» для заметки: Кант и Гаман — да, Кант и Вольтер — уже нет */
const NEAR_NOTE_KM = 450;
const NEAR_NOTE_LIMIT = 8;

/**
 * Рядом в то же время: кто жил неподалёку и что случалось, пока шла
 * жизнь персоны или писалась работа. Тоже фон из Wikidata, тоже без текста.
 */
export function NoteNearby({
  lat,
  lon,
  from,
  to,
}: {
  lat: number;
  lon: number;
  from: number;
  to: number;
}) {
  const notes = useArcheStore((s) => s.notes);
  const [context, setContext] = useState<ContextData | null>(null);

  useEffect(() => {
    let alive = true;
    loadContext().then((data) => {
      if (!alive || !data) return;
      setContext(withoutVaultDuplicates(data, new Set(notes.map((n) => normalizeTitle(n.title)))));
    });
    return () => {
      alive = false;
    };
  }, [notes]);

  const nearby = useMemo(() => {
    if (!context) return null;
    const near = (p: { lat: number; lon: number }) => distanceKm(lat, lon, p.lat, p.lon) <= NEAR_NOTE_KM;
    const people = context.people
      .filter((p) => p.birth <= to && (p.death ?? p.birth + 70) >= from && near(p))
      .slice(0, NEAR_NOTE_LIMIT)
      .sort((a, b) => a.birth - b.birth);
    const events = context.events
      .filter((e) => e.year <= to && (e.end ?? e.year) >= from && near(e))
      .slice(0, NEAR_NOTE_LIMIT)
      .sort((a, b) => a.year - b.year);
    return { people, events };
  }, [context, lat, lon, from, to]);

  if (!nearby || (nearby.people.length === 0 && nearby.events.length === 0)) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Рядом в то же время · Wikidata
      </h3>
      <div className="grid gap-5 md:grid-cols-2">
        {nearby.people.length > 0 && (
          <ul className="space-y-1 text-sm">
            {nearby.people.map((p) => {
              const url = wikipediaUrl(p);
              return (
                <li key={p.id}>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
                      {p.title}
                    </a>
                  ) : (
                    p.title
                  )}
                  <span className="text-muted-foreground">
                    {' '}
                    · {formatYear(p.birth)}
                    {p.death ? `–${formatYear(p.death)}` : ''}
                    {p.place ? ` · ${p.place}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {nearby.events.length > 0 && (
          <ul className="space-y-1 text-sm">
            {nearby.events.map((e) => {
              const url = wikipediaUrl(e);
              return (
                <li key={e.id}>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
                      {e.title}
                    </a>
                  ) : (
                    e.title
                  )}
                  <span className="text-muted-foreground">
                    {' '}
                    · {formatYear(e.year)}
                    {e.end ? `–${formatYear(e.end)}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
