/**
 * Состояние хранилища: чего заметкам не хватает, чтобы работать во всех разделах.
 *
 * Приложение устроено так, что каждая возможность чем-то питается: карта —
 * датировкой, глобус — географией, родословная и вопросы тестов — причинными
 * связями, повторение — карточками. Заметка без датировки не «сломана», она
 * просто не видна на карте, и понять это, глядя на саму заметку, невозможно.
 *
 * Этот модуль считает такие пробелы и превращает их в список того, что стоит
 * дописать. Хаб уже ведёт раздел «Чего здесь пока нет» руками — здесь то же
 * самое, но про каждую заметку и без ручной работы.
 */
import type { ArcheNote } from './types';
import type { KnowledgeGraph } from './knowledge';
import { RELATION_META } from './relations';
import type { PlaceIndex, Place } from './geo';

export type GapKind =
  | 'no-time'
  | 'no-place'
  | 'no-causal'
  | 'orphan'
  | 'stub'
  | 'no-source';

export interface GapMeta {
  title: string;
  /** Что именно не работает без этого */
  consequence: string;
}

export const GAP_META: Record<GapKind, GapMeta> = {
  'no-time': {
    title: 'Без датировки',
    consequence: 'не попадает на карту и в вопросы «что было раньше»',
  },
  'no-place': {
    title: 'Без географии',
    consequence: 'не попадает на глобус',
  },
  'no-causal': {
    title: 'Без причинных связей',
    consequence: 'нет родословной, не попадает в вопросы «из чего возникло»',
  },
  orphan: {
    title: 'На них никто не ссылается',
    consequence: 'до заметки можно дойти только поиском',
  },
  stub: {
    title: 'Совсем короткие',
    consequence: 'мало текста для карточек и ленты',
  },
  'no-source': {
    title: 'Источник не указан',
    consequence: 'в разделе источников стоит «требуется источник»',
  },
};

export interface GapItem {
  noteId: string;
  title: string;
  type?: string;
}

export interface Gap {
  kind: GapKind;
  items: GapItem[];
}

export interface Coverage {
  label: string;
  covered: number;
  total: number;
}

export interface HealthReport {
  totalNotes: number;
  /** Заметки, которые вообще участвуют в проверках */
  checked: number;
  coverage: Coverage[];
  gaps: Gap[];
}

/** Служебное: тесты и шаблоны не заметки в смысле содержания */
const SKIP_TYPES = new Set(['quiz']);

/** Типы, у которых география осмысленна. У понятия места нет, и это нормально */
const GEO_TYPES = new Set(['person', 'work', 'event', 'place']);

const STUB_LENGTH = 400;
const SOURCE_PLACEHOLDER = /требуется источник/i;

export interface HealthInput {
  notes: ArcheNote[];
  graph: KnowledgeGraph;
  placeIndex: PlaceIndex;
  placesOf: Map<string, Place[]>;
  backlinksOf: (noteId: string) => ArcheNote[];
}

export function buildHealthReport({
  notes,
  graph,
  placesOf,
  backlinksOf,
}: HealthInput): HealthReport {
  const checked = notes.filter((note) => !SKIP_TYPES.has(note.type ?? ''));

  const buckets: Record<GapKind, GapItem[]> = {
    'no-time': [],
    'no-place': [],
    'no-causal': [],
    orphan: [],
    stub: [],
    'no-source': [],
  };

  let dated = 0;
  let located = 0;
  let causal = 0;
  let geoRelevant = 0;

  for (const note of checked) {
    const item: GapItem = { noteId: note.id, title: note.title, type: note.type };
    const node = graph.nodeById.get(note.id);

    if (node?.time) dated += 1;
    else buckets['no-time'].push(item);

    if (GEO_TYPES.has(note.type ?? '')) {
      geoRelevant += 1;
      if (placesOf.has(note.id)) located += 1;
      else buckets['no-place'].push(item);
    }

    const hasCausal = (graph.adjacent.get(note.id) ?? []).some(
      (edge) => RELATION_META[edge.kind].genealogical
    );
    if (hasCausal) causal += 1;
    else buckets['no-causal'].push(item);

    if (backlinksOf(note.id).length === 0) buckets.orphan.push(item);
    if ((note.plainText?.length ?? 0) < STUB_LENGTH) buckets.stub.push(item);
    if (SOURCE_PLACEHOLDER.test(note.body)) buckets['no-source'].push(item);
  }

  const byTitle = (a: GapItem, b: GapItem) => a.title.localeCompare(b.title, 'ru');

  return {
    totalNotes: notes.length,
    checked: checked.length,
    coverage: [
      { label: 'На карте времени', covered: dated, total: checked.length },
      { label: 'На глобусе', covered: located, total: geoRelevant },
      { label: 'С причинными связями', covered: causal, total: checked.length },
    ],
    gaps: (Object.keys(buckets) as GapKind[])
      .map((kind) => ({ kind, items: buckets[kind].sort(byTitle) }))
      .filter((gap) => gap.items.length > 0),
  };
}
