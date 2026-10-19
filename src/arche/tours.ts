/**
 * Маршруты по глобусу: учебник, который листается картой.
 *
 * Три источника, одна форма:
 *   — глава курса из хаба (Учёба): уроки по порядку, у каждого — год и место;
 *   — война из базы знаний: её сражения по датам;
 *   — течение из базы знаний: его люди по годам рождения.
 *
 * Своих данных у маршрута нет: глава — это хаб в Obsidian, война и
 * течение — Wikidata. Поправил хаб — поменялся маршрут.
 */
import { excerptOf } from './excerpt';
import { battlesOf, type Kb, type KbLinks } from './kb';
import type { KnowledgeGraph } from './knowledge';
import type { Chapter, Course } from './learning/curriculum';
import type { Place } from './geo';
import type { ArcheNote } from './types';
import type { ContextData } from './context';

export type TourSelection =
  | { kind: 'place'; id: string }
  | { kind: 'context'; id: string }
  | { kind: 'kb'; id: string };

export interface TourStep {
  key: string;
  title: string;
  /** «Сражение · 1631», «Персона · Эфес» */
  sub?: string;
  /** Подпись из хаба: зачем этот урок в главе */
  hook?: string;
  /** Пара строк из заметки или описание из Wikidata */
  text?: string;
  year: number | null;
  at: [number, number] | null;
  /** Откуда место, если не своё: «через Гераклита» */
  via?: string;
  /** Заметка хранилища — её можно открыть и отметить прочитанной */
  noteId?: string;
  /** Что выделить на карте */
  selection?: TourSelection;
}

export interface Tour {
  id: string;
  title: string;
  /** «Глава курса», «Война по сражениям» */
  kind: string;
  steps: TourStep[];
}

export interface ChapterTourInput {
  course: Course;
  chapter: Chapter;
  graph: KnowledgeGraph;
  notesById: Map<string, ArcheNote>;
  placesOf: Map<string, Place[]>;
}

/**
 * Место урока: своё, а если его нет (у понятий места нет по замыслу) —
 * место ближайшей по времени связанной заметки: «Логос» встаёт в Эфес
 * через Гераклита. Подпись «через …» честно говорит, откуда точка
 */
function lessonPlace(
  noteId: string,
  year: number | null,
  { graph, placesOf }: Pick<ChapterTourInput, 'graph' | 'placesOf'>
): { place: Place; via?: string } | null {
  const own = placesOf.get(noteId)?.[0];
  if (own) return { place: own };
  const neighbours = (graph.adjacent.get(noteId) ?? [])
    .map((edge) => (edge.sourceId === noteId ? edge.targetId : edge.sourceId))
    .map((id) => ({ id, node: graph.nodeById.get(id), place: placesOf.get(id)?.[0] }))
    .filter((n) => n.node && n.place && n.node.type !== 'place');
  if (neighbours.length === 0) return null;
  const distance = (n: (typeof neighbours)[number]) =>
    year === null || !n.node!.time ? 0 : Math.abs(n.node!.time.displayYear - year);
  const best = neighbours.sort((a, b) => distance(a) - distance(b))[0];
  return { place: best.place!, via: best.node!.title };
}

export function chapterTour(input: ChapterTourInput): Tour {
  const { course, chapter, graph, notesById } = input;
  const steps = chapter.lessons.map<TourStep>((lesson) => {
    const node = graph.nodeById.get(lesson.noteId);
    const note = notesById.get(lesson.noteId);
    const year = node?.time?.displayYear ?? null;
    const found = lessonPlace(lesson.noteId, year, input);
    return {
      key: lesson.noteId,
      title: lesson.title,
      sub: [found?.place.title, year !== null ? undefined : 'без даты'].filter(Boolean).join(' · ') || undefined,
      hook: lesson.hook,
      text: note ? excerptOf(note, 260) : undefined,
      year,
      at: found ? [found.place.geo.lon, found.place.geo.lat] : null,
      via: found?.via,
      noteId: lesson.noteId,
      selection: found ? { kind: 'place', id: found.place.id } : undefined,
    };
  });
  return {
    id: `chapter:${chapter.id}`,
    title: chapter.ordinal ? `${chapter.ordinal}: ${chapter.title}` : chapter.title,
    kind: `Глава курса · ${course.title}`,
    steps,
  };
}

/** Война по сражениям: от первого к последнему, у каждого — точка и год */
export function warTour(kb: Kb, id: string): Tour | null {
  const war = kb.items[id];
  if (!war) return null;
  const steps = battlesOf(kb, id)
    .map((b) => ({ id: b, item: kb.items[b] }))
    .filter((b) => b.item?.c && b.item.f !== undefined)
    .sort((a, b) => a.item.f! - b.item.f!)
    .map<TourStep>(({ id: battleId, item }) => ({
      key: battleId,
      title: item.n,
      // Сражение части войны — с её названием: у Тридцатилетней войны в Wikidata
      // своих сражений нет, они числятся за «входящими» войнами, и это стоит видеть
      sub: [`Сражение · ${item.f}`, item.w && item.w !== id ? kb.items[item.w]?.n : null].filter(Boolean).join(' · '),
      text: item.d,
      year: item.f!,
      at: item.c!,
      selection: { kind: 'kb', id: battleId },
    }));
  return steps.length >= 2 ? { id: `war:${id}`, title: war.n, kind: 'Война по сражениям', steps } : null;
}

/** Сколько представителей течения можно поставить на карту: у кого есть место рождения */
export function movementPlaced(links: KbLinks, context: ContextData, id: string): number {
  const people = new Set(context.people.map((p) => p.id));
  return (links.members[id] ?? []).filter((q) => people.has(q)).length;
}

/**
 * Течение по людям: представители по годам рождения, на месте рождения.
 * Год шага — тридцать лет от рождения: так человек уже взрослый, а
 * карта показывает мир, в котором он работал, а не в котором родился
 */
export function movementTour(kb: Kb, links: KbLinks, context: ContextData, id: string): Tour | null {
  const movement = kb.items[id];
  const members = links.members[id];
  if (!movement || !members) return null;
  const people = new Map(context.people.map((p) => [p.id, p]));
  const steps = members
    .map((q) => ({ q, person: people.get(q), info: links.persons[q] }))
    .filter((m) => m.person)
    .sort((a, b) => a.person!.birth - b.person!.birth)
    .map<TourStep>(({ q, person }) => ({
      key: q,
      title: person!.title,
      sub: `${person!.birth}${person!.death ? `–${person!.death}` : ''}${person!.place ? ` · ${person!.place}` : ''}`,
      text: person!.description ?? undefined,
      year: Math.min(person!.birth + 30, person!.death ?? person!.birth + 30),
      at: [person!.lon, person!.lat],
      selection: { kind: 'context', id: q },
    }));
  return steps.length >= 2 ? { id: `movement:${id}`, title: movement.n, kind: 'Течение в людях', steps } : null;
}

/** Расстояние по большому кругу, км — для самопроверки «где это?» */
export function kmBetween(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
