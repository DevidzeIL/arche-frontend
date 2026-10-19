import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, Swords, X } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { excerptOf } from '@/arche/excerpt';
import { noteTypeLabel, noteTypeMeta } from '@/arche/noteTypes';
import { formatYear } from '@/arche/timeSpan';
import { polityOfPlace, stateName, wikipediaUrl, type StateShape } from '@/arche/borders';
import { eventsAround, isAlive, windowFor, type ContextData, type ContextEvent, type ContextPerson } from '@/arche/context';
import { cityExistsAt, cityNameAt, cityNames, type CitiesData, type City } from '@/arche/cities';
import {
  capitalAt,
  commonsPage,
  commonsThumb,
  flagAt,
  isRulingAt,
  type PolityFacts,
  type Ruler,
} from '@/arche/polityFacts';
import { useWikidataImage, useWikiSummary } from '@/arche/wikipedia';
import { battlesOf, nameOf, typeLabel, yearsOf, type Kb, type KbLinks } from '@/arche/kb';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { plural } from '@/lib/plural';
import type { GlobeSelection } from './GlobeCanvas';

/** Последний год, для которого есть границы */
export const PRESENT = 2024;

export interface LocatedNote {
  noteId: string;
  title: string;
  type?: string;
  year: number;
  endYear?: number;
  placeIds: string[];
}

function yearsLabel(from: number, to: number): string {
  if (to >= PRESENT) return `с ${formatYear(from)}`;
  return `${formatYear(from)} — ${formatYear(to)}`;
}

export function PanelHeader({
  title,
  subtitle,
  onClose,
  onBack,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  /** Назад по цепочке: государство → правитель → война */
  onBack?: () => void;
}) {
  return (
    <header className="flex items-start justify-between gap-2 border-b border-border/40 p-4">
      {onBack && (
        <Button variant="ghost" size="icon" className="-ml-2 shrink-0" onClick={onBack} aria-label="Назад">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="font-serif text-2xl leading-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть">
        <X className="h-4 w-4" />
      </Button>
    </header>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">{children}</h3>
  );
}

/**
 * Заметки списком — с первой фразой. Раньше было только название, и чтобы
 * понять, о чём заметка, приходилось уходить со страницы глобуса.
 */
export function NoteList({
  items,
  year,
  withExcerpt = true,
}: {
  items: LocatedNote[];
  year?: number;
  withExcerpt?: boolean;
}) {
  const getNote = useArcheStore((s) => s.getNote);
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const note = withExcerpt ? getNote(item.noteId) : undefined;
        const excerpt = note ? excerptOf(note, 150) : '';
        return (
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
                {excerpt && (
                  <span className="mt-0.5 block line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">
                    {excerpt}
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Изображение с Commons: у каждого файла свой автор и лицензия — ссылка ведёт к ним */
export function CommonsImage({ file, alt, className }: { file: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <a href={commonsPage(file)} target="_blank" rel="noreferrer" title="Wikimedia Commons: автор и лицензия">
      <img
        src={commonsThumb(file, 360)}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn('rounded-md border border-border/40 bg-muted/30 object-contain', className)}
      />
    </a>
  );
}

/**
 * Вступление статьи Википедии. Чужой текст — с подписью и ссылкой,
 * подгружается живьём и в хранилище не попадает (см. arche/wikipedia.ts).
 */
export function WikiExtract({
  article,
  showThumbnail,
}: {
  article: { ru?: string | null; en?: string | null };
  showThumbnail: boolean;
}) {
  const { summary, loading } = useWikiSummary(article.ru || article.en ? article : null);
  if (loading) {
    return <p className="animate-pulse text-[13px] text-muted-foreground">Загружаю справку из Википедии…</p>;
  }
  if (!summary) return null;
  return (
    <section className="rounded-lg border border-border/40 bg-muted/20 p-3">
      {showThumbnail && summary.thumbnail && (
        <img
          src={summary.thumbnail}
          alt=""
          loading="lazy"
          className="float-right mb-1 ml-3 max-h-28 max-w-[40%] rounded object-cover"
        />
      )}
      <p className="text-[13px] leading-relaxed">{summary.extract}</p>
      <p className="clear-both mt-2 text-[11px] text-muted-foreground">
        <a href={summary.url} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
          Википедия{summary.lang === 'en' ? ' (англ.)' : ''}
        </a>{' '}
        · CC BY-SA 4.0 · справка, а не заметка хранилища
      </p>
    </section>
  );
}

export function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function PlacePanel({
  onBack,
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
  onBack?: () => void;
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
        onBack={onBack}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Button variant="outline" size="sm" asChild className="mb-4">
          <Link to={`/note/${placeId}`}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            О месте и чья это была земля
          </Link>
        </Button>

        {polity && (
          <p className="mb-4 text-sm">
            <span className="text-muted-foreground">В {formatYear(year)} году — </span>
            {polity.src === 'bg' || polity.nomap ? (
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
          <p className="text-sm text-muted-foreground">К этому году здесь ещё ничего не произошло.</p>
        ) : (
          <NoteList items={notes} />
        )}
      </div>
    </>
  );
}

/** Сколько правителей показывать вокруг выбранного года до «показать всех» */
const RULERS_AROUND = 4;

export function StatePanel({
  onBack,
  shape,
  year,
  notes,
  unions,
  facts,
  rulers,
  onClose,
  onJump,
}: {
  shape: StateShape | null;
  year: number;
  notes: LocatedNote[];
  unions: StateShape[];
  facts: PolityFacts | undefined;
  rulers: Ruler[] | undefined;
  onClose: () => void;
  /** Перейти к предшественнику или преемнику: год и государство */
  onJump: (qid: string, direction: 'prev' | 'next') => void;
  onBack?: () => void;
}) {
  const [allRulers, setAllRulers] = useState(false);

  const rulerWindow = useMemo(() => {
    if (!rulers || rulers.length === 0) return { list: [], hidden: 0 };
    if (allRulers) return { list: rulers, hidden: 0 };
    // Текущий правитель и несколько соседей: список из сорока королей
    // Франции целиком прочитать некому
    let at = rulers.findIndex((r) => isRulingAt(r, year));
    if (at < 0) at = Math.max(0, rulers.findIndex((r) => r[1] > year) - 1);
    if (at < 0) at = rulers.length - 1;
    const from = Math.max(0, at - RULERS_AROUND);
    const list = rulers.slice(from, from + RULERS_AROUND * 2 + 1);
    return { list, hidden: rulers.length - list.length };
  }, [rulers, year, allRulers]);

  if (!shape) {
    return (
      <>
        <PanelHeader title="Государство" onClose={onClose} />
        <p className="p-4 text-sm text-muted-foreground">
          В {formatYear(year)} году этого государства на карте нет. Сдвиньте год или выберите другое.
        </p>
      </>
    );
  }

  const ru = stateName(shape, year);
  const polity = shape.polity;
  const from = polity?.f ?? shape.patch?.from ?? shape.from;
  const to = polity?.t ?? shape.patch?.to ?? shape.to;
  const article = { ru: polity?.rw ?? shape.patch?.ruwiki, en: polity?.w ?? shape.patch?.wikipedia };
  const wiki = wikipediaUrl(article);
  const wikidata = polity?.q ?? shape.patch?.wikidata;
  const sorted = [...notes].sort((a, b) => a.year - b.year);
  const capital = capitalAt(facts, year);
  const flag = flagAt(facts, year);

  return (
    <>
      <PanelHeader
        title={ru}
        subtitle={
          <>
            {shape.name !== ru && <span className="italic">{shape.name}</span>}
            {shape.name !== ru && ' · '}
            на карте {yearsLabel(from, to)}
          </>
        }
        onClose={onClose}
        onBack={onBack}
      />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 text-sm">
        {(flag || facts?.arms || facts?.d) && (
          <div className="flex items-start gap-3">
            {flag && <CommonsImage file={flag} alt="Флаг" className="h-14 w-auto max-w-[96px]" />}
            {facts?.arms && <CommonsImage file={facts.arms} alt="Герб" className="h-14 w-auto max-w-[64px]" />}
            {facts?.d && <p className="min-w-0 flex-1 leading-snug text-muted-foreground">{facts.d}</p>}
          </div>
        )}

        <dl className="divide-y divide-border/30">
          {capital && <FactRow label="Столица">{capital.name}</FactRow>}
          {unions.length > 0 && (
            <FactRow label="В составе">{unions.map((u) => stateName(u, year)).join(', ')}</FactRow>
          )}
          {facts?.gov && <FactRow label="Правление">{facts.gov.join(', ')}</FactRow>}
          {facts?.lang && <FactRow label="Языки">{facts.lang.join(', ')}</FactRow>}
          {facts?.rel && <FactRow label={facts.ro ? 'Официальная религия' : 'Религия'}>{facts.rel.join(', ')}</FactRow>}
          {(facts?.inc !== undefined || facts?.dis !== undefined) && (
            <FactRow label="Существовало">
              {facts?.inc !== undefined ? formatYear(facts.inc) : '…'} —{' '}
              {facts?.dis !== undefined ? formatYear(facts.dis) : 'наши дни'}
            </FactRow>
          )}
        </dl>

        {rulerWindow.list.length > 0 && (
          <section>
            <SectionTitle>Правители</SectionTitle>
            <ul className="space-y-0.5">
              {rulerWindow.list.map((r) => {
                const now = isRulingAt(r, year);
                return (
                  <li
                    key={`${r[3]}-${r[1]}`}
                    className={cn(
                      'flex items-baseline justify-between gap-3 rounded-md px-2 py-1',
                      now && 'bg-accent/70 font-medium'
                    )}
                  >
                    <a
                      href={`https://www.wikidata.org/wiki/${r[3]}`}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate hover:underline"
                    >
                      {r[0]}
                    </a>
                    <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">
                      {formatYear(r[1])}
                      {r[2] !== null && r[2] !== r[1] && <>–{formatYear(r[2])}</>}
                    </span>
                  </li>
                );
              })}
            </ul>
            {rulerWindow.hidden > 0 && (
              <button
                type="button"
                onClick={() => setAllRulers(true)}
                className="mt-1 px-2 text-[12px] text-muted-foreground hover:text-foreground"
              >
                Все {rulers!.length}
              </button>
            )}
          </section>
        )}

        {(facts?.prev || facts?.next) && (
          <section className="space-y-1.5">
            {facts?.prev && (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-muted-foreground">До:</span>
                {facts.prev.map(([qid, name]) => (
                  <button
                    key={qid}
                    type="button"
                    onClick={() => onJump(qid, 'prev')}
                    className="inline-flex items-center gap-1 rounded-full border border-border/50 px-2 py-0.5 text-[12.5px] hover:bg-accent/50"
                  >
                    <ArrowLeft className="h-3 w-3" aria-hidden />
                    {name}
                  </button>
                ))}
              </div>
            )}
            {facts?.next && (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-muted-foreground">После:</span>
                {facts.next.map(([qid, name]) => (
                  <button
                    key={qid}
                    type="button"
                    onClick={() => onJump(qid, 'next')}
                    className="inline-flex items-center gap-1 rounded-full border border-border/50 px-2 py-0.5 text-[12.5px] hover:bg-accent/50"
                  >
                    {name}
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        <WikiExtract article={article} showThumbnail={!flag} />

        <section>
          <SectionTitle>Заметки в этих границах</SectionTitle>
          {sorted.length === 0 ? (
            <p className="text-muted-foreground">
              Ни одна заметка хранилища не происходила здесь, пока существовало это государство.
            </p>
          ) : (
            <NoteList items={sorted} year={year} />
          )}
        </section>

        <p className="text-[12px] text-muted-foreground">
          Границы на {formatYear(year)} год действуют в наборе с {formatYear(shape.from)} по{' '}
          {formatYear(shape.to)}.{' '}
          {shape.source === 'patch'
            ? 'Поправка хранилища: в Cliopatria этого здесь нет или оно неверно.'
            : 'По данным Cliopatria — приблизительно.'}{' '}
          Сведения — Wikidata.
        </p>

        {shape.patch?.note && (
          <p className="rounded-lg border border-border/40 bg-muted/30 p-3 text-[13px] leading-relaxed">
            {shape.patch.note}
          </p>
        )}

        {(wiki || wikidata) && (
          <div className="flex flex-wrap gap-2">
            {wikidata && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/kb/${wikidata}`}>
                  <BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Страница
                </Link>
              </Button>
            )}
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
      </div>
    </>
  );
}

export function ContextPanel({
  onBack,
  item,
  context,
  nearby,
  onClose,
}: {
  item: ContextData['events'][number] | ContextData['people'][number];
  context: ContextData;
  /** Заметки хранилища рядом — по времени и по месту */
  nearby: LocatedNote[];
  onClose: () => void;
  onBack?: () => void;
}) {
  const isPerson = 'birth' in item;
  const wiki = wikipediaUrl(item);
  const image = useWikidataImage(item.id);

  return (
    <>
      <PanelHeader
        title={item.title}
        subtitle={
          isPerson
            ? `${context.groups[item.group] ?? 'Человек'} · ${formatYear(item.birth)}${item.death ? ` — ${formatYear(item.death)}` : ''}`
            : `${context.kinds[item.kind] ?? 'Событие'} · ${formatYear(item.year)}${item.end ? ` — ${formatYear(item.end)}` : ''}`
        }
        onClose={onClose}
        onBack={onBack}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        {image && <CommonsImage key={image} file={image} alt={item.title} className="max-h-56 w-full" />}
        {item.description && <p className="leading-relaxed">{item.description}</p>}

        <dl className="divide-y divide-border/30">
          {isPerson ? (
            <>
              {item.place && <FactRow label="Родился">{item.place}</FactRow>}
              {item.deathPlace && <FactRow label="Умер">{item.deathPlace}</FactRow>}
            </>
          ) : (
            item.place && <FactRow label="Где">{item.place}</FactRow>
          )}
        </dl>

        <WikiExtract article={item} showThumbnail={!image} />

        {nearby.length > 0 && (
          <section>
            <SectionTitle>Рядом в хранилище</SectionTitle>
            <NoteList items={nearby} />
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/kb/${item.id}`}>
              <BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Страница
            </Link>
          </Button>
          {wiki && (
            <Button variant="ghost" size="sm" asChild>
              <a href={wiki} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Википедия
              </a>
            </Button>
          )}
        </div>
        <p className="border-t border-border/40 pt-3 text-[12px] leading-relaxed text-muted-foreground">
          Это фон из Wikidata, а не заметка хранилища. Если тема стоит того — заметку можно написать.
        </p>
      </div>
    </>
  );
}

/** Сколько строк в каждом разделе «а в это время» */
const MEANWHILE_LIMIT = 8;

export function MeanwhilePanel({
  onBack,
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
  onBack?: () => void;
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

  const events = context ? eventsAround(context, year, MEANWHILE_LIMIT * 2) : [];
  const people = context
    ? context.people.filter((p) => isAlive(p, year)).slice(0, MEANWHILE_LIMIT * 2)
    : [];

  return (
    <>
      <PanelHeader
        title="А в это время"
        subtitle={`${formatYear(year)} год, ± ${span} ${plural(span, 'год', 'года', 'лет')}`}
        onClose={onClose}
        onBack={onBack}
      />
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 text-sm">
        <section>
          <SectionTitle>В хранилище</SectionTitle>
          {ours.length === 0 ? (
            <p className="text-muted-foreground">Ни одной заметки об этом времени.</p>
          ) : (
            <NoteList items={ours} withExcerpt={false} />
          )}
        </section>

        {largest.length > 0 && (
          <section>
            <SectionTitle>Крупнейшие государства</SectionTitle>
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

        {events.length > 0 && context && (
          <section>
            <SectionTitle>События</SectionTitle>
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
                      {context.kinds[e.kind] ?? 'Событие'} · {formatYear(e.year)}
                      {e.end ? `–${formatYear(e.end)}` : ''}
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
            <SectionTitle>Жили в это время</SectionTitle>
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

/**
 * Справка о войне, течении, религии, народе или эпохе — прямо на глобусе.
 * Полная страница со всеми связями — по ссылке «Страница и связи».
 */
export function KbPanel({
  id,
  kb,
  links,
  onClose,
  onBack,
  onShowWar,
  onPickPerson,
}: {
  id: string;
  kb: Kb;
  links: KbLinks | null;
  onClose: () => void;
  onBack?: () => void;
  /** Показать войну на карте: участники, сражения, годы */
  onShowWar?: (id: string) => void;
  onPickPerson?: (id: string) => void;
}) {
  const item = kb.items[id];
  const image = useWikidataImage(item ? id : null);
  if (!item) {
    return (
      <>
        <PanelHeader title="Справка" onClose={onClose} onBack={onBack} />
        <p className="p-4 text-sm text-muted-foreground">Этой записи в базе нет.</p>
      </>
    );
  }
  const name = (q: string) => nameOf(kb, links, q) ?? q;
  const war = item.t === 'battle' && item.w ? kb.items[item.w] : null;
  const members = item.t === 'movement' ? (links?.members[id] ?? []).slice(0, 12) : [];

  const list = (label: string, ids: string[] | undefined) =>
    ids && ids.length > 0 ? (
      <FactRow label={label}>
        {ids.map((q, i) => (
          <span key={q}>
            {i > 0 && ', '}
            {kb.items[q] ? (
              <Link to={`/kb/${q}`} className="underline decoration-border underline-offset-2 hover:decoration-foreground">
                {name(q)}
              </Link>
            ) : (
              name(q)
            )}
          </span>
        ))}
      </FactRow>
    ) : null;

  return (
    <>
      <PanelHeader
        title={item.n}
        subtitle={[typeLabel(kb, item), yearsOf(item, formatYear)].filter(Boolean).join(' · ')}
        onClose={onClose}
        onBack={onBack}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        {image && <CommonsImage key={image} file={image} alt={item.n} className="max-h-56 w-full" />}
        {item.d && <p className="leading-relaxed">{item.d}</p>}

        <dl className="divide-y divide-border/30">
          {war && item.w && list('Часть войны', [item.w])}
          {list('Стороны', item.p)}
          {list('Лица', item.ld)}
          {item.dead ? <FactRow label="Погибших">{item.dead.toLocaleString('ru-RU')}</FactRow> : null}
          {list('Причины', item.ca)}
          {list('Последствия', item.ef)}
          {list('Часть', item.of)}
          {list('Основатели', item.fo)}
          {list('Откуда', item.o)}
          {list('Отделилась от', item.pa)}
          {list('Языки', item.lang)}
          {list('Религии', item.rel)}
          {item.pop ? <FactRow label="Численность">{item.pop.toLocaleString('ru-RU')}</FactRow> : null}
          {list('До', item.prev)}
          {list('После', item.next)}
        </dl>

        {item.t === 'war' && battlesOf(kb, id).length > 0 && (
          <p className="text-muted-foreground">
            {battlesOf(kb, id).length} {plural(battlesOf(kb, id).length, 'сражение', 'сражения', 'сражений')} этой войны есть на карте.
          </p>
        )}

        {members.length > 0 && (
          <section>
            <SectionTitle>Представители</SectionTitle>
            <ul className="space-y-0.5">
              {members.map((p) => {
                const person = links?.persons[p];
                return (
                  <li key={p}>
                    <button
                      type="button"
                      onClick={() => onPickPerson?.(p)}
                      className="w-full rounded-md px-2 py-1 text-left hover:bg-accent/50"
                    >
                      {person?.[0] ?? p}
                      {person?.[1] ? (
                        <span className="text-[12px] text-muted-foreground">
                          {' '}
                          · {formatYear(person[1])}
                          {person[2] ? `–${formatYear(person[2])}` : ''}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <WikiExtract article={item} showThumbnail={!image} />

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/kb/${id}`}>
              <BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Страница и связи
            </Link>
          </Button>
          {item.t === 'war' && onShowWar && (
            <Button variant="outline" size="sm" onClick={() => onShowWar(id)}>
              <Swords className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Война на карте
            </Button>
          )}
          {war && item.w && onShowWar && (
            <Button variant="outline" size="sm" onClick={() => onShowWar(item.w!)}>
              <Swords className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Вся война на карте
            </Button>
          )}
        </div>
        <p className="border-t border-border/40 pt-3 text-[12px] leading-relaxed text-muted-foreground">
          Справка из Wikidata, а не заметка хранилища.
        </p>
      </div>
    </>
  );
}

/** Что собрано о городе-ориентире: считается в GlobeView, где есть все данные */
export interface CityFacts {
  /** В чьих границах город в выбранный год */
  state: { key: string; name: string } | null;
  union: string | null;
  born: ContextPerson[];
  died: ContextPerson[];
  events: ContextEvent[];
  nearby: LocatedNote[];
}

function CityList<T extends { id: string; title: string }>({
  title,
  items,
  sub,
  onPick,
}: {
  title: string;
  items: T[];
  sub: (item: T) => string;
  onPick: (item: T) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onPick(item)}
              className="w-full rounded px-1 py-0.5 text-left hover:bg-accent/40"
            >
              <span className="text-foreground">{item.title}</span>
              <span className="text-muted-foreground"> · {sub(item)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Город-ориентир: как назывался, чей был в этот год, кто здесь родился
 * и умер, что здесь происходило. Сам город — не заметка, но через него
 * видно соседство: в Кёнигсберге родились Кант и Гофман, умер Кант,
 * а в 1758 году город присягнул Елизавете
 */
export function CityPanel({
  city,
  data,
  year,
  facts,
  onClose,
  onBack,
  onSelect,
}: {
  city: City;
  data: CitiesData;
  year: number;
  facts: CityFacts;
  onClose: () => void;
  onBack?: () => void;
  onSelect: (selection: GlobeSelection) => void;
}) {
  const nameNow = cityNameAt(data, city, year);
  const names = cityNames(data, city);
  const founded =
    city.from === null
      ? null
      : city.approx
        ? 'в античности (точный год не указан)'
        : formatYear(city.from);
  const wiki = wikipediaUrl(city);
  const span = (from: number | null, to: number | null) =>
    from === null ? `до ${formatYear(to!)}` : to === null ? `с ${formatYear(from)}` : `${formatYear(from)} — ${formatYear(to)}`;

  return (
    <>
      <PanelHeader
        title={nameNow}
        subtitle={
          <>
            Город{founded && !city.approx ? ` · основан ${founded}` : ''}
            {nameNow !== city.name && <> · сейчас {city.name}</>}
          </>
        }
        onClose={onClose}
        onBack={onBack}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        {!cityExistsAt(city, year) && (
          <p className="rounded-md bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
            {city.to !== null && year > city.to
              ? `В ${formatYear(year)} году города уже нет: ${formatYear(city.to)} — последний год, указанный в Wikidata.`
              : `В ${formatYear(year)} году города ещё нет${city.from !== null && !city.approx ? ` — он основан в ${formatYear(city.from)}` : ''}.`}
          </p>
        )}
        <dl className="divide-y divide-border/30">
          <FactRow label={`В ${formatYear(year)}`}>
            {facts.state ? (
              <button
                type="button"
                onClick={() => onSelect({ kind: 'state', key: facts.state!.key })}
                className="text-left underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                {facts.state.name}
              </button>
            ) : (
              <span className="text-muted-foreground">границ на карте нет</span>
            )}
            {facts.union && <span className="text-muted-foreground"> · в составе: {facts.union}</span>}
          </FactRow>
          {founded && <FactRow label="Основан">{founded}</FactRow>}
          {city.to !== null && <FactRow label="Упразднён">{formatYear(city.to)}</FactRow>}
          {names.length > 0 && (
            <FactRow label="Названия">
              <ul>
                {names.map((n) => (
                  <li key={`${n.name}-${n.from}`} className={cn(n.name === nameNow && 'font-medium')}>
                    {n.name} <span className="text-muted-foreground">· {span(n.from, n.to)}</span>
                  </li>
                ))}
              </ul>
            </FactRow>
          )}
        </dl>

        <WikiExtract article={city} showThumbnail />

        {facts.nearby.length > 0 && (
          <section>
            <SectionTitle>В хранилище</SectionTitle>
            <NoteList items={facts.nearby} />
          </section>
        )}

        <CityList
          title="Родились здесь"
          items={facts.born}
          sub={(p) => `${formatYear(p.birth)}${p.death ? ` — ${formatYear(p.death)}` : ''}`}
          onPick={(p) => onSelect({ kind: 'context', id: p.id })}
        />
        <CityList
          title="Умерли здесь"
          items={facts.died}
          sub={(p) => `${formatYear(p.birth)}${p.death ? ` — ${formatYear(p.death)}` : ''}`}
          onPick={(p) => onSelect({ kind: 'context', id: p.id })}
        />
        <CityList
          title="Что здесь происходило"
          items={facts.events}
          sub={(e) => `${formatYear(e.year)}${e.end && e.end !== e.year ? ` — ${formatYear(e.end)}` : ''}`}
          onPick={(e) => onSelect({ kind: 'context', id: e.id })}
        />

        <div className="flex flex-wrap gap-2">
          {wiki && (
            <Button variant="ghost" size="sm" asChild>
              <a href={wiki} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Википедия
              </a>
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <a href={`https://www.wikidata.org/wiki/${city.id}`} target="_blank" rel="noreferrer">
              Wikidata
            </a>
          </Button>
        </div>
        <p className="border-t border-border/40 pt-3 text-[12px] leading-relaxed text-muted-foreground">
          Город — ориентир из Wikidata, а не заметка хранилища. Родившиеся — по месту рождения в Wikidata,
          события — в двадцати километрах вокруг.
        </p>
      </div>
    </>
  );
}
