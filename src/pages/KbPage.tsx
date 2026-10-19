import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, Globe2, Route, Swords } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { placesForGraph } from '@/arche/geo';
import { polityOfPlace } from '@/arche/sovereignty';
import { polityKey } from '@/arche/bordersData';
import { formatYear } from '@/arche/timeSpan';
import { noteTypeLabel, noteTypeMeta } from '@/arche/noteTypes';
import { excerptOf } from '@/arche/excerpt';
import { backlinksOf, battlesOf, influenceOf, nameOf, typeLabel, yearsOf } from '@/arche/kb';
import { capitalAt, flagAt, isRulingAt, loadPolityFacts, loadRulers, type PolityFacts, type Ruler } from '@/arche/polityFacts';
import { loadReferenceData, resolveEntity, type ReferenceData } from '@/arche/reference';
import { wikipediaUrl } from '@/arche/sovereignty';
import { useVaultLinks } from '@/arche/vaultLinks';
import { useWikidataImage } from '@/arche/wikipedia';
import { Button } from '@/components/ui/button';
import { CommonsImage, FactRow, WikiExtract } from '@/components/globe/GlobePanels';
import { cn } from '@/lib/utils';
import type { ArcheNote } from '@/arche/types';

const BordersMiniMap = lazy(() =>
  import('@/components/globe/BordersMiniMap').then((m) => ({ default: m.BordersMiniMap }))
);

const MAP_HEIGHT = 280;
/** Сколько имён «кто на кого повлиял» видно сразу: у Канта их полсотни */
const INFLUENCE_SHOWN = 15;
const PRESENT = 2024;

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border/30 pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl text-foreground/90">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function NoteCard({ note }: { note: ArcheNote }) {
  return (
    <Link to={`/note/${note.id}`} className="block rounded-lg border border-border/40 p-3 transition-colors hover:border-border hover:bg-accent/30">
      <span className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: noteTypeMeta(note.type).graphColor }} aria-hidden />
        <span className="font-serif text-[15px]">{note.title}</span>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{noteTypeLabel(note.type)}</span>
      </span>
      <span className="mt-1 block line-clamp-2 text-[13px] text-muted-foreground">{excerptOf(note, 160)}</span>
    </Link>
  );
}

/**
 * Страница справки: война, течение, религия, народ, эпоха, государство,
 * человек или событие — всё, что пришло из Wikidata, с его связями.
 *
 * Это не заметка и не станет ею: факты, годы, связи и ссылка на статью.
 * Но отсюда видно, как вещи держатся друг за друга — Семилетняя война
 * ведёт к своим участникам, участник — к правителям, правитель —
 * к людям, на которых повлиял, и к заметкам хранилища рядом.
 */
export function KbPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const notes = useArcheStore((s) => s.notes);
  const graph = useArcheStore((s) => s.knowledgeGraph);
  const vault = useVaultLinks();
  const [data, setData] = useState<ReferenceData | null>(null);
  const [facts, setFacts] = useState<Record<string, PolityFacts> | null>(null);
  const [rulers, setRulers] = useState<Record<string, Ruler[]> | null>(null);
  const [allRulers, setAllRulers] = useState(false);
  const [allBattles, setAllBattles] = useState(false);
  const [allInfluence, setAllInfluence] = useState(false);

  useEffect(() => {
    let alive = true;
    loadReferenceData().then((loaded) => alive && setData(loaded));
    loadPolityFacts().then((loaded) => alive && setFacts(loaded));
    loadRulers().then((loaded) => alive && setRulers(loaded));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setAllRulers(false);
    setAllBattles(false);
    window.scrollTo?.(0, 0);
  }, [id]);

  const entity = data ? resolveEntity(data, id) : null;
  const image = useWikidataImage(entity ? id : null);
  const kb = data?.kb ?? null;
  const links = data?.links ?? null;

  /** Заметки хранилища с их годом и местами — для «в эти годы» и «в этих границах» */
  const located = useMemo(() => {
    const { placesOf } = placesForGraph(notes, graph);
    return notes
      .map((note) => ({ note, time: graph.nodeById.get(note.id)?.time ?? null, places: placesOf.get(note.id) ?? [] }))
      .filter((n) => n.time && n.note.type !== 'place' && n.note.type !== 'hub');
  }, [notes, graph]);

  const name = (q: string) => nameOf(kb, links, q) ?? q;

  /** Ссылка на что угодно: заметка хранилища важнее справки */
  const EntityLink = ({ q, children }: { q: string; children?: React.ReactNode }) => {
    const note = vault.notesOf(q)[0];
    if (note) {
      return (
        <Link to={`/note/${note.id}`} className="font-medium underline decoration-border underline-offset-2 hover:decoration-foreground">
          {children ?? note.title}
        </Link>
      );
    }
    const resolvable = data && resolveEntity(data, q);
    if (!resolvable) return <span>{children ?? name(q)}</span>;
    return (
      <Link to={`/kb/${q}`} className="underline decoration-border underline-offset-2 hover:decoration-foreground">
        {children ?? name(q)}
      </Link>
    );
  };

  const LinkList = ({ ids, empty }: { ids: string[] | undefined; empty?: string }) =>
    ids && ids.length > 0 ? (
      <>
        {ids.map((q, i) => (
          <span key={q}>
            {i > 0 && ', '}
            <EntityLink q={q} />
          </span>
        ))}
      </>
    ) : empty ? (
      <span className="text-muted-foreground">{empty}</span>
    ) : null;

  if (!data) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Загружаю справку…</div>;
  }

  if (!entity) {
    return (
      <div className="h-full w-full overflow-y-auto">
        <div className="container mx-auto max-w-3xl px-6 py-12">
          <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-2 mb-8">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад
          </Button>
          <h1 className="font-serif text-3xl">Справки нет</h1>
          <p className="mt-2 text-muted-foreground">
            Элемента {id} нет в собранных данных.{' '}
            <a href={`https://www.wikidata.org/wiki/${id}`} target="_blank" rel="noreferrer" className="underline">
              Открыть в Wikidata
            </a>
          </p>
        </div>
      </div>
    );
  }

  // Заголовок, годы и статья — по виду сущности
  let title = '';
  let kind = '';
  let years: string | null = null;
  let description: string | null = null;
  let article: { ru?: string | null; en?: string | null } = {};
  let globeHref: string | null = null;
  /** Маршрут по глобусу: война — по сражениям, течение — по людям */
  let tourHref: string | null = null;
  let from: number | undefined;
  let to: number | undefined;

  if (entity.kind === 'kb' && kb) {
    const item = entity.item;
    title = item.n;
    kind = typeLabel(kb, item);
    years = yearsOf(item, formatYear);
    description = item.d ?? null;
    article = item;
    from = item.f;
    to = item.e ?? item.f;
    if (item.t === 'war') globeHref = `/globe?war=${id}${item.f !== undefined ? `&year=${item.f}` : ''}`;
    else if (item.t === 'battle') globeHref = `/globe?kb=${id}${item.w ? `&war=${item.w}` : ''}${item.f !== undefined ? `&year=${item.f}` : ''}`;
    else if (item.c) globeHref = `/globe?kb=${id}${item.f !== undefined ? `&year=${item.f}` : ''}`;
    if (item.t === 'war' && battlesOf(kb, id).filter((b) => kb.items[b]?.c).length >= 2) tourHref = `/globe?tour=war:${id}`;
    if (item.t === 'movement' && (links?.members[id]?.length ?? 0) >= 2) tourHref = `/globe?tour=movement:${id}`;
  } else if (entity.kind === 'polity') {
    const base = entity.entries.find((p) => !p.u) ?? entity.entries[0];
    title = base.ru ?? base.n;
    kind = 'Государство';
    from = Math.min(...entity.entries.map((p) => p.f));
    to = Math.max(...entity.entries.map((p) => p.t));
    years = `на карте ${formatYear(from)} — ${to >= PRESENT ? 'наши дни' : formatYear(to)}`;
    description = facts?.[id]?.d ?? null;
    article = { ru: base.rw, en: base.w };
    globeHref = `/globe?state=${encodeURIComponent(polityKey(base))}&year=${Math.round((from + Math.min(to, PRESENT)) / 2)}`;
  } else if (entity.kind === 'event' && data.context) {
    const e = entity.event;
    title = e.title;
    kind = data.context.kinds[e.kind] ?? 'Событие';
    years = e.end ? `${formatYear(e.year)} — ${formatYear(e.end)}` : formatYear(e.year);
    description = e.description;
    article = e;
    from = e.year;
    to = e.end ?? e.year;
    globeHref = `/globe?item=${id}&year=${e.year}`;
  } else if (entity.kind === 'person') {
    const p = entity.person;
    const known = entity.known;
    title = p?.title ?? known?.[0] ?? id;
    kind = p && data.context ? data.context.groups[p.group] ?? 'Человек' : 'Человек';
    const birth = p?.birth ?? known?.[1] ?? null;
    const death = p?.death ?? known?.[2] ?? null;
    years = birth !== null ? `${formatYear(birth)}${death !== null ? ` — ${formatYear(death)}` : ''}` : null;
    description = p?.description ?? null;
    article = p ?? {};
    from = birth ?? undefined;
    to = death ?? (birth !== null ? birth + 70 : undefined);
    if (p) globeHref = `/globe?item=${id}&year=${p.birth + 25}`;
  }

  const ownNotes = vault.notesOf(id);
  const wiki = wikipediaUrl(article);

  /** Заметки хранилища в эти годы — если годы известны */
  const inYears =
    from !== undefined && to !== undefined
      ? located
          .filter(({ time }) => time!.startYear <= to! && (time!.endYear ?? time!.startYear) >= from!)
          .filter(({ note }) => !ownNotes.includes(note))
          .slice(0, 8)
      : [];

  return (
    <div className="h-full w-full overflow-y-auto bg-background">
      <div className="container mx-auto max-w-4xl px-6 py-12 lg:px-12">
        <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-2 mb-8">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Назад
        </Button>

        <article className="space-y-8">
          <header className="space-y-3 border-b border-border/30 pb-6">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Справка · {kind}</p>
            <h1 className="break-words font-serif text-3xl font-light leading-tight sm:text-4xl lg:text-5xl">{title}</h1>
            {years && <p className="text-muted-foreground">{years}</p>}
            {description && <p className="max-w-2xl text-[15px] leading-relaxed">{description}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              {ownNotes.map((note) => (
                <Button key={note.id} size="sm" asChild>
                  <Link to={`/note/${note.id}`}>
                    <BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Заметка: {note.title}
                  </Link>
                </Button>
              ))}
              {globeHref && (
                <Button size="sm" variant="outline" asChild>
                  <Link to={globeHref}>
                    {entity.kind === 'kb' && entity.item.t === 'war' ? (
                      <Swords className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <Globe2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    )}
                    На глобусе
                  </Link>
                </Button>
              )}
              {tourHref && (
                <Button size="sm" variant="outline" asChild>
                  <Link to={tourHref}>
                    <Route className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    {entity.kind === 'kb' && entity.item.t === 'war' ? 'Пройти по сражениям' : 'Пройти по людям'}
                  </Link>
                </Button>
              )}
              {wiki && (
                <Button size="sm" variant="ghost" asChild>
                  <a href={wiki} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Википедия
                  </a>
                </Button>
              )}
              <Button size="sm" variant="ghost" asChild>
                <a href={`https://www.wikidata.org/wiki/${id}`} target="_blank" rel="noreferrer">
                  Wikidata
                </a>
              </Button>
            </div>
          </header>

          <div className="grid gap-6 md:grid-cols-[1fr_240px]">
            <WikiExtract article={article} showThumbnail={!image} />
            {image && <CommonsImage key={image} file={image} alt={title} className="max-h-72 w-full" />}
          </div>

          {/* ─── Война ─── */}
          {entity.kind === 'kb' && kb && entity.item.t === 'war' && (() => {
            const item = entity.item;
            const battles = battlesOf(kb, id)
              .map((b) => ({ id: b, item: kb.items[b] }))
              .filter((b) => b.item)
              .sort((a, b) => (a.item.f ?? 0) - (b.item.f ?? 0));
            const subWars = backlinksOf(kb, id).filter((r) => r.rel === 'part' && kb.items[r.id]?.t === 'war');
            const points = battles.filter((b) => b.item.c).slice(0, 40);
            return (
              <>
                <Section title="Как это было устроено">
                  <dl className="divide-y divide-border/30 text-sm">
                    <FactRow label="Стороны"><LinkList ids={item.p} empty="в Wikidata не указаны" /></FactRow>
                    {item.ld && <FactRow label="Лица"><LinkList ids={item.ld} /></FactRow>}
                    <FactRow label="Причины"><LinkList ids={item.ca} empty="в Wikidata не указаны — см. справку выше" /></FactRow>
                    <FactRow label="Последствия"><LinkList ids={item.ef} empty="в Wikidata не указаны" /></FactRow>
                    {item.of && <FactRow label="Часть"><LinkList ids={item.of} /></FactRow>}
                    {item.dead ? <FactRow label="Погибших">{item.dead.toLocaleString('ru-RU')}</FactRow> : null}
                    {subWars.length > 0 && (
                      <FactRow label="Входящие войны"><LinkList ids={subWars.map((r) => r.id)} /></FactRow>
                    )}
                  </dl>
                </Section>
                {battles.length > 0 && (
                  <Section
                    title={`Сражения · ${battles.length}`}
                    aside={globeHref && (
                      <Button size="sm" variant="outline" asChild>
                        <Link to={globeHref}><Swords className="mr-1.5 h-3.5 w-3.5" aria-hidden />Война на глобусе</Link>
                      </Button>
                    )}
                  >
                    {points.length > 0 && (
                      <Suspense fallback={<div className="rounded-lg border border-border/40" style={{ height: MAP_HEIGHT }} />}>
                        <BordersMiniMap
                          year={item.f ?? points[0].item.f ?? 0}
                          height={MAP_HEIGHT}
                          points={points.map((b, i) => ({ lon: b.item.c![0], lat: b.item.c![1], label: i < 6 ? b.item.n : '' }))}
                        />
                      </Suspense>
                    )}
                    <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      {(allBattles ? battles : battles.slice(0, 20)).map((b) => (
                        <li key={b.id}>
                          <EntityLink q={b.id} />
                          {b.item.f !== undefined && <span className="text-muted-foreground"> · {formatYear(b.item.f)}</span>}
                        </li>
                      ))}
                    </ul>
                    {battles.length > 20 && !allBattles && (
                      <button type="button" onClick={() => setAllBattles(true)} className="text-sm text-muted-foreground hover:text-foreground">
                        Все {battles.length}
                      </button>
                    )}
                  </Section>
                )}
              </>
            );
          })()}

          {/* ─── Сражение ─── */}
          {entity.kind === 'kb' && entity.item.t === 'battle' && (() => {
            const item = entity.item;
            return (
              <Section title="Где и в какой войне">
                <dl className="divide-y divide-border/30 text-sm">
                  {item.w && <FactRow label="Война"><EntityLink q={item.w} /></FactRow>}
                  {item.f !== undefined && <FactRow label="Год">{formatYear(item.f)}</FactRow>}
                </dl>
                {item.c && (
                  <Suspense fallback={<div className="rounded-lg border border-border/40" style={{ height: MAP_HEIGHT }} />}>
                    <BordersMiniMap year={item.f ?? 0} height={MAP_HEIGHT} points={[{ lon: item.c[0], lat: item.c[1], label: item.n }]} />
                  </Suspense>
                )}
              </Section>
            );
          })()}

          {/* ─── Течение ─── */}
          {entity.kind === 'kb' && kb && entity.item.t === 'movement' && (() => {
            const item = entity.item;
            const members = links?.members[id] ?? [];
            const parts = backlinksOf(kb, id).filter((r) => r.rel === 'part');
            const vaultMembers = members.flatMap((m) => vault.notesOf(m));
            return (
              <>
                <Section title="Что это за течение">
                  <dl className="divide-y divide-border/30 text-sm">
                    {item.k && <FactRow label="Область">{kb.movementKinds[item.k] ?? item.k}</FactRow>}
                    {item.o && <FactRow label="Откуда"><LinkList ids={item.o} /></FactRow>}
                    {item.fo && <FactRow label="Основатели"><LinkList ids={item.fo} /></FactRow>}
                    {item.of && <FactRow label="Часть"><LinkList ids={item.of} /></FactRow>}
                    {parts.length > 0 && <FactRow label="Ответвления"><LinkList ids={parts.map((r) => r.id)} /></FactRow>}
                  </dl>
                </Section>
                {vaultMembers.length > 0 && (
                  <Section title="В хранилище">
                    <div className="grid gap-3 md:grid-cols-2">
                      {vaultMembers.map((note) => <NoteCard key={note.id} note={note} />)}
                    </div>
                  </Section>
                )}
                {members.length > 0 && (
                  <Section title={`Представители · ${members.length}`}>
                    <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      {members.map((m) => {
                        const person = links?.persons[m];
                        return (
                          <li key={m}>
                            <EntityLink q={m}>{person?.[0] ?? name(m)}</EntityLink>
                            {person?.[1] ? (
                              <span className="text-muted-foreground">
                                {' '}· {formatYear(person[1])}{person[2] ? `–${formatYear(person[2])}` : ''}
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </Section>
                )}
              </>
            );
          })()}

          {/* ─── Религия ─── */}
          {entity.kind === 'kb' && kb && entity.item.t === 'religion' && (() => {
            const item = entity.item;
            const branches = backlinksOf(kb, id).filter((r) => r.rel === 'branch');
            const needle = item.n.toLowerCase().slice(0, Math.max(5, item.n.length - 3));
            const states =
              facts && data.index
                ? Object.entries(facts)
                    .filter(([, f]) => f.ro && f.rel?.some((r) => r.toLowerCase().includes(needle)))
                    .map(([q]) => data.index!.polities.find((p) => p.q === q && !p.u))
                    .filter((p): p is NonNullable<typeof p> => Boolean(p))
                    .sort((a, b) => b.t - b.f - (a.t - a.f))
                    .slice(0, 24)
                : [];
            return (
              <>
                <Section title="Откуда и куда">
                  <dl className="divide-y divide-border/30 text-sm">
                    {item.fo && <FactRow label="Основатели"><LinkList ids={item.fo} /></FactRow>}
                    {item.o && <FactRow label="Откуда"><LinkList ids={item.o} /></FactRow>}
                    {item.pa && <FactRow label="Отделилась от"><LinkList ids={item.pa} /></FactRow>}
                    {branches.length > 0 && <FactRow label="Ветви"><LinkList ids={branches.map((r) => r.id)} /></FactRow>}
                  </dl>
                </Section>
                {states.length > 0 && (
                  <Section title="Государства, где была государственной">
                    <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      {states.map((p) => (
                        <li key={p.q}>
                          <EntityLink q={p.q!}>{p.ru ?? p.n}</EntityLink>
                          <span className="text-muted-foreground"> · {formatYear(p.f)}–{p.t >= PRESENT ? 'наши дни' : formatYear(p.t)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      По сведениям Wikidata об официальной религии государств. На глобусе — раскраска «Религия».
                    </p>
                  </Section>
                )}
              </>
            );
          })()}

          {/* ─── Народ ─── */}
          {entity.kind === 'kb' && entity.item.t === 'nation' && (
            <Section title="О народе">
              <dl className="divide-y divide-border/30 text-sm">
                {entity.item.pop ? <FactRow label="Численность">{entity.item.pop.toLocaleString('ru-RU')}</FactRow> : null}
                {entity.item.lang && <FactRow label="Языки"><LinkList ids={entity.item.lang} /></FactRow>}
                {entity.item.rel && <FactRow label="Религии"><LinkList ids={entity.item.rel} /></FactRow>}
                {entity.item.of && <FactRow label="Часть"><LinkList ids={entity.item.of} /></FactRow>}
                {entity.item.o && <FactRow label="Страны"><LinkList ids={entity.item.o} /></FactRow>}
              </dl>
            </Section>
          )}

          {/* ─── Эпоха ─── */}
          {entity.kind === 'kb' && kb && entity.item.t === 'period' && (() => {
            const item = entity.item;
            const parts = backlinksOf(kb, id).filter((r) => r.rel === 'part');
            const events =
              item.f !== undefined && data.context
                ? data.context.events
                    .filter((e) => e.year >= item.f! && e.year <= (item.e ?? item.f!))
                    .slice(0, 12)
                    .sort((a, b) => a.year - b.year)
                : [];
            return (
              <>
                <Section title="Место во времени">
                  <dl className="divide-y divide-border/30 text-sm">
                    {item.o && <FactRow label="Где"><LinkList ids={item.o} /></FactRow>}
                    {item.of && <FactRow label="Часть"><LinkList ids={item.of} /></FactRow>}
                    {item.prev && <FactRow label="До"><LinkList ids={item.prev} /></FactRow>}
                    {item.next && <FactRow label="После"><LinkList ids={item.next} /></FactRow>}
                    {parts.length > 0 && <FactRow label="Делится на"><LinkList ids={parts.map((r) => r.id)} /></FactRow>}
                  </dl>
                </Section>
                {events.length > 0 && (
                  <Section title="События этого времени">
                    <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      {events.map((e) => (
                        <li key={e.id}>
                          <EntityLink q={e.id}>{e.title}</EntityLink>
                          <span className="text-muted-foreground"> · {formatYear(e.year)}</span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
              </>
            );
          })()}

          {/* ─── Государство ─── */}
          {entity.kind === 'polity' && (() => {
            const f = facts?.[id];
            const list = rulers?.[id] ?? [];
            const keys = new Set(entity.entries.map(polityKey));
            const wars = kb ? backlinksOf(kb, id).filter((r) => r.rel === 'war') : [];
            const inBorders = located.filter(({ time, places }) =>
              places.some((place) => {
                const segment = polityOfPlace(place.id, time!.displayYear);
                return segment?.k ? keys.has(segment.k) || (segment.u && keys.has(segment.u.k)) : false;
              })
            );
            const mid = Math.round(((from ?? 0) + Math.min(to ?? 0, PRESENT)) / 2);
            const flag = flagAt(f, mid);
            return (
              <>
                <Section title="Сведения">
                  <div className="flex flex-wrap items-start gap-4">
                    {flag && <CommonsImage file={flag} alt="Флаг" className="h-16 w-auto max-w-[110px]" />}
                    {f?.arms && <CommonsImage file={f.arms} alt="Герб" className="h-16 w-auto max-w-[80px]" />}
                  </div>
                  <dl className="divide-y divide-border/30 text-sm">
                    {f?.cap && (
                      <FactRow label="Столицы">
                        {f.cap.map(([cap, , , cf, ct], i) => (
                          <span key={`${cap}-${i}`}>
                            {i > 0 && ', '}
                            {cap}
                            {(cf !== null || ct !== null) && (
                              <span className="text-muted-foreground"> ({cf !== null ? formatYear(cf) : '…'}–{ct !== null ? formatYear(ct) : '…'})</span>
                            )}
                          </span>
                        ))}
                      </FactRow>
                    )}
                    {!f?.cap && capitalAt(f, mid) && <FactRow label="Столица">{capitalAt(f, mid)!.name}</FactRow>}
                    {f?.gov && <FactRow label="Правление">{f.gov.join(', ')}</FactRow>}
                    {f?.lang && <FactRow label="Языки">{f.lang.join(', ')}</FactRow>}
                    {f?.rel && <FactRow label={f.ro ? 'Официальная религия' : 'Религия'}>{f.rel.join(', ')}</FactRow>}
                    {(f?.inc !== undefined || f?.dis !== undefined) && (
                      <FactRow label="Существовало">
                        {f?.inc !== undefined ? formatYear(f.inc) : '…'} — {f?.dis !== undefined ? formatYear(f.dis) : 'наши дни'}
                      </FactRow>
                    )}
                    {f?.prev && (
                      <FactRow label="До">
                        {f.prev.map(([q, n], i) => (
                          <span key={q}>{i > 0 && ', '}<ArrowLeft className="mr-0.5 inline h-3 w-3" /><EntityLink q={q}>{n}</EntityLink></span>
                        ))}
                      </FactRow>
                    )}
                    {f?.next && (
                      <FactRow label="После">
                        {f.next.map(([q, n], i) => (
                          <span key={q}>{i > 0 && ', '}<EntityLink q={q}>{n}</EntityLink><ArrowRight className="ml-0.5 inline h-3 w-3" /></span>
                        ))}
                      </FactRow>
                    )}
                  </dl>
                </Section>

                {list.length > 0 && (
                  <Section title={`Правители · ${list.length}`}>
                    <ul className="grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
                      {(allRulers ? list : list.slice(0, 24)).map((r) => (
                        <li key={`${r[3]}-${r[1]}`} className={cn('flex justify-between gap-3 rounded px-1.5 py-0.5', isRulingAt(r, mid) && 'bg-accent/50')}>
                          <EntityLink q={r[3]}>{r[0]}</EntityLink>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {formatYear(r[1])}{r[2] !== null && r[2] !== r[1] ? `–${formatYear(r[2])}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {list.length > 24 && !allRulers && (
                      <button type="button" onClick={() => setAllRulers(true)} className="text-sm text-muted-foreground hover:text-foreground">
                        Все {list.length}
                      </button>
                    )}
                  </Section>
                )}

                {wars.length > 0 && kb && (
                  <Section title={`Войны · ${wars.length}`}>
                    <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      {wars
                        .map((r) => ({ id: r.id, item: kb.items[r.id] }))
                        .sort((a, b) => (a.item?.f ?? 0) - (b.item?.f ?? 0))
                        .map((w) => (
                          <li key={w.id}>
                            <EntityLink q={w.id} />
                            {w.item?.f !== undefined && <span className="text-muted-foreground"> · {yearsOf(w.item, formatYear)}</span>}
                          </li>
                        ))}
                    </ul>
                  </Section>
                )}

                {inBorders.length > 0 && (
                  <Section title="Заметки хранилища в этих границах">
                    <div className="grid gap-3 md:grid-cols-2">
                      {inBorders.slice(0, 12).map(({ note }) => <NoteCard key={note.id} note={note} />)}
                    </div>
                  </Section>
                )}
              </>
            );
          })()}

          {/* ─── Человек ─── */}
          {entity.kind === 'person' && links && (() => {
            const p = entity.person;
            const movements = links.movementsOf[id] ?? [];
            // Сначала те, о ком есть заметка: с них удобнее всего продолжить чтение
            const vaultFirst = (ids: string[]) =>
              [...ids].sort((a, b) => Number(vault.notesOf(b).length > 0) - Number(vault.notesOf(a).length > 0));
            const by = vaultFirst(influenceOf(links, id).by);
            const on = vaultFirst(influenceOf(links, id).on);
            const shown = (ids: string[]) => (allInfluence ? ids : ids.slice(0, INFLUENCE_SHOWN));
            return (
              <>
                <Section title="Жизнь">
                  <dl className="divide-y divide-border/30 text-sm">
                    {p?.place && <FactRow label="Родился">{p.place}</FactRow>}
                    {p?.deathPlace && <FactRow label="Умер">{p.deathPlace}</FactRow>}
                    {movements.length > 0 && <FactRow label="Течения"><LinkList ids={movements} /></FactRow>}
                  </dl>
                </Section>
                {(by.length > 0 || on.length > 0) && (
                  <Section title="Кто на кого повлиял">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                          На него повлияли · {by.length}
                        </h3>
                        <ul className="space-y-0.5 text-sm">
                          {shown(by).map((q) => <li key={q}><EntityLink q={q} /></li>)}
                        </ul>
                      </div>
                      <div>
                        <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                          Он повлиял на · {on.length}
                        </h3>
                        <ul className="space-y-0.5 text-sm">
                          {shown(on).map((q) => <li key={q}><EntityLink q={q} /></li>)}
                        </ul>
                      </div>
                    </div>
                    {Math.max(by.length, on.length) > INFLUENCE_SHOWN && !allInfluence && (
                      <button type="button" onClick={() => setAllInfluence(true)} className="mt-2 text-sm text-muted-foreground hover:text-foreground">
                        Показать всех
                      </button>
                    )}
                  </Section>
                )}
              </>
            );
          })()}

          {/* ─── Событие ─── */}
          {entity.kind === 'event' && (
            <Section title="Где">
              <dl className="divide-y divide-border/30 text-sm">
                {entity.event.place && <FactRow label="Место">{entity.event.place}</FactRow>}
              </dl>
              <Suspense fallback={<div className="rounded-lg border border-border/40" style={{ height: MAP_HEIGHT }} />}>
                <BordersMiniMap
                  year={entity.event.year}
                  height={MAP_HEIGHT}
                  points={[{ lon: entity.event.lon, lat: entity.event.lat, label: entity.event.title }]}
                />
              </Suspense>
            </Section>
          )}

          {inYears.length > 0 && (
            <Section title="В хранилище в эти годы">
              <div className="grid gap-3 md:grid-cols-2">
                {inYears.map(({ note }) => <NoteCard key={note.id} note={note} />)}
              </div>
            </Section>
          )}

          <p className="border-t border-border/30 pt-4 text-xs text-muted-foreground">
            Справка собрана из Wikidata (CC0): факты, годы и связи, без чужого текста. Вступление
            статьи — Википедия (CC BY-SA), изображение — Wikimedia Commons. Это не заметка
            хранилища{inBordersHint(ownNotes.length)}.
          </p>
        </article>
      </div>
    </div>
  );
}

function inBordersHint(own: number): string {
  return own > 0 ? '; своя заметка — по кнопке вверху' : ' — если тема стоит того, заметку можно написать';
}

