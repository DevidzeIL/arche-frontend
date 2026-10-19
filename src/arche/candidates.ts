/**
 * Кандидаты в заметки: о ком и о чём хранилище уже говорит, не написав.
 *
 * Связи берутся из базы знаний (Wikidata): кто на кого повлиял, кто в каком
 * течении, кто участвовал в войне. Если с Кантом, Локком и Руссо связан Юм,
 * а заметки о Юме нет — это пробел, и не случайный. Чем с большим числом
 * своих заметок связан кандидат, тем выше он в списке.
 *
 * Это подсказка, а не план: писать или нет — решает автор.
 */
import { influenceOf, typeLabel, type Kb, type KbLinks } from './kb';
import { formatYear } from './timeSpan';
import type { ArcheNote } from './types';
import type { VaultLinks } from './vaultLinks';

export interface Candidate {
  id: string;
  name: string;
  /** «Персона · 1711–1776», «Течение» */
  kind: string;
  /** С чем из хранилища связан: «повлиял на Канта» */
  reasons: string[];
  /** Сколько своих заметок с ним связано */
  score: number;
}

export function noteCandidates(
  notes: ArcheNote[],
  vault: VaultLinks,
  kb: Kb | null,
  links: KbLinks,
  limit = 15
): Candidate[] {
  const found = new Map<string, { notes: Set<string>; reasons: string[] }>();
  const add = (qid: string, noteTitle: string, reason: string) => {
    if (vault.notesOf(qid).length > 0) return;
    const entry = found.get(qid) ?? { notes: new Set<string>(), reasons: [] };
    if (!entry.notes.has(noteTitle)) {
      entry.notes.add(noteTitle);
      entry.reasons.push(reason);
    }
    found.set(qid, entry);
  };

  for (const note of notes) {
    const qid = vault.qidOf(note.id);
    if (!qid) continue;
    const { by, on } = influenceOf(links, qid);
    for (const q of by) add(q, note.title, `повлиял на: ${note.title}`);
    for (const q of on) add(q, note.title, `под влиянием: ${note.title}`);
    for (const m of links.movementsOf[qid] ?? []) add(m, note.title, `течение, где ${note.title}`);
    for (const q of links.members[qid] ?? []) add(q, note.title, `из течения «${note.title}»`);
    const item = kb?.items[qid];
    if (item?.t === 'war') for (const q of item.ld ?? []) add(q, note.title, `участник: ${note.title}`);
  }

  const degree = (qid: string) => {
    const { by, on } = influenceOf(links, qid);
    return by.length + on.length + (links.members[qid]?.length ?? 0);
  };

  return [...found.entries()]
    .map(([id, entry]) => {
      const person = links.persons[id];
      const item = kb?.items[id];
      const name = person?.[0] ?? item?.n ?? kb?.labels[id] ?? id;
      const kind = person
        ? `Персона${person[1] !== null ? ` · ${formatYear(person[1])}${person[2] !== null ? ` — ${formatYear(person[2])}` : ''}` : ''}`
        : item && kb
          ? typeLabel(kb, item)
          : 'Справка';
      return { id, name, kind, reasons: entry.reasons, score: entry.notes.size, degree: degree(id) };
    })
    .filter((c) => c.score >= 2)
    .sort((a, b) => b.score - a.score || b.degree - a.degree)
    .slice(0, limit)
    .map(({ degree: _degree, ...candidate }) => candidate);
}
