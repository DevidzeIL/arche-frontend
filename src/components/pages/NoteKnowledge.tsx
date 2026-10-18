import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Swords } from 'lucide-react';
import { backlinksOf, influenceOf, loadKb, loadKbLinks, nameOf, typeLabel, yearsOf, type Kb, type KbLinks } from '@/arche/kb';
import { useVaultLinks } from '@/arche/vaultLinks';
import { formatYear } from '@/arche/timeSpan';
import { Button } from '@/components/ui/button';
import type { ArcheNote } from '@/arche/types';

/** Сколько имён показывать в каждом списке: дальше — на странице справки */
const LIMIT = 10;

/**
 * Заметка в большой картине: к какому течению принадлежал Кант,
 * кто на него повлиял и на кого повлиял он; кто воевал в войне,
 * из чего она выросла и чем кончилась.
 *
 * Связи — из Wikidata (pnpm kb). Заметки хранилища в списках идут
 * первыми и ведут на свои страницы: так видно, как хранилище
 * сшивается с остальным миром и где в нём дыры.
 */
export function NoteKnowledge({ note }: { note: ArcheNote }) {
  const vault = useVaultLinks();
  const qid = vault.qidOf(note.id);
  const [kb, setKb] = useState<Kb | null>(null);
  const [links, setLinks] = useState<KbLinks | null>(null);

  useEffect(() => {
    if (!qid) return;
    let alive = true;
    loadKb().then((loaded) => alive && setKb(loaded));
    loadKbLinks().then((loaded) => alive && setLinks(loaded));
    return () => {
      alive = false;
    };
  }, [qid]);

  if (!qid || (!kb && !links)) return null;

  const item = kb?.items[qid];
  const name = (q: string) => nameOf(kb, links, q) ?? q;

  /** Свои заметки — первыми и со своей ссылкой; остальное — в справку */
  const People = ({ ids }: { ids: string[] }) => {
    const own = ids.filter((q) => vault.notesOf(q).length > 0);
    const rest = ids.filter((q) => vault.notesOf(q).length === 0);
    const shown = [...own, ...rest].slice(0, LIMIT);
    return (
      <span>
        {shown.map((q, i) => {
          const mine = vault.notesOf(q)[0];
          return (
            <span key={q}>
              {i > 0 && ', '}
              {mine ? (
                <Link to={`/note/${mine.id}`} className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
                  {mine.title}
                </Link>
              ) : (
                <Link to={`/kb/${q}`} className="hover:underline">
                  {name(q)}
                </Link>
              )}
            </span>
          );
        })}
        {ids.length > LIMIT && <span className="text-muted-foreground"> и ещё {ids.length - LIMIT}</span>}
      </span>
    );
  };

  const rows: Array<{ label: string; ids: string[] }> = [];
  if (links) {
    const movements = links.movementsOf[qid] ?? [];
    if (movements.length) rows.push({ label: 'Течения', ids: movements });
    const { by, on } = influenceOf(links, qid);
    if (by.length) rows.push({ label: 'На него повлияли', ids: by });
    if (on.length) rows.push({ label: 'Он повлиял на', ids: on });
  }
  if (item && kb) {
    if (item.t === 'war') {
      if (item.p?.length) rows.push({ label: 'Стороны', ids: item.p });
      if (item.ld?.length) rows.push({ label: 'Лица', ids: item.ld });
      if (item.ca?.length) rows.push({ label: 'Причины', ids: item.ca });
      if (item.ef?.length) rows.push({ label: 'Последствия', ids: item.ef });
    }
    if (item.t === 'movement') {
      const members = links?.members[qid] ?? [];
      if (members.length) rows.push({ label: 'Представители', ids: members });
      if (item.o?.length) rows.push({ label: 'Откуда', ids: item.o });
    }
    if (item.t === 'religion') {
      if (item.fo?.length) rows.push({ label: 'Основатели', ids: item.fo });
      if (item.pa?.length) rows.push({ label: 'Отделилась от', ids: item.pa });
      const branches = backlinksOf(kb, qid).filter((r) => r.rel === 'branch').map((r) => r.id);
      if (branches.length) rows.push({ label: 'Ветви', ids: branches });
    }
    if (item.t === 'period') {
      if (item.prev?.length) rows.push({ label: 'До', ids: item.prev });
      if (item.next?.length) rows.push({ label: 'После', ids: item.next });
      const parts = backlinksOf(kb, qid).filter((r) => r.rel === 'part').map((r) => r.id);
      if (parts.length) rows.push({ label: 'Делится на', ids: parts });
    }
  }

  return (
    <section className="space-y-4 border-t border-border/30 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-2xl text-foreground/90">В большой картине</h2>
        <div className="flex flex-wrap gap-2">
          {item?.t === 'war' && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/globe?war=${qid}${item.f !== undefined ? `&year=${item.f}` : ''}`}>
                <Swords className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Война на глобусе
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to={`/kb/${qid}`}>
              <BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Справка и все связи
            </Link>
          </Button>
        </div>
      </div>

      {item && kb && (
        <p className="text-sm text-muted-foreground">
          В Wikidata: {typeLabel(kb, item).toLowerCase()}
          {yearsOf(item, formatYear) && `, ${yearsOf(item, formatYear)}`}
          {item.t === 'war' && item.b?.length ? ` · ${item.b.length} сражений на карте` : ''}
        </p>
      )}

      {rows.length > 0 ? (
        <dl className="divide-y divide-border/30 text-[15px]">
          {rows.map((row) => (
            <div key={row.label} className="grid gap-1 py-2 sm:grid-cols-[10rem_1fr] sm:gap-3">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="text-muted-foreground">
                <People ids={row.ids} />
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          Связей в Wikidata для этой заметки немного — справка покажет то, что есть.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Связи — из Wikidata (CC0). Жирным — заметки хранилища; остальное ведёт на справку.
        Привязка подобрана по названию; если неверна, впишите в заметку <code>wikidata: Q…</code>.
      </p>
    </section>
  );
}
