/**
 * Лента фрагментов — «зайти на минуту и прочитать один блок».
 *
 * АТОМ ЛЕНТЫ — РАЗДЕЛ ЗАМЕТКИ, А НЕ ЗАМЕТКА. Правила хранилища требуют
 * «не более 1–2 экранов текста на раздел», поэтому разделы уже написаны
 * как самостоятельные куски: медиана — около четырёхсот знаков, то есть
 * ровно один экран телефона. Резать и склеивать ничего не нужно, лента
 * достаётся из vault'а даром.
 *
 * Порядок — НЕ случайный. Следующий фрагмент берётся у соседа по графу,
 * и переход подписывается тем же объяснением, что рисует карта. Пролистывание
 * получается не потоком разрозненных фактов, а дрейфом по родословной:
 * «Гераклит → Платон — ученик, через которого мы его и знаем». Именно это
 * отличает ленту от бесконечной прокрутки, которая ничего не оставляет.
 */
import type { ArcheNote } from './types';
import type { KnowledgeGraph } from './knowledge';
import { RELATION_META, type RelationKind } from './relations';
import { formatYear } from './timeSpan';
import { firstImageOf } from './images';

export interface Fragment {
  /** `<noteId>#<номер раздела>` — переживает переименование заголовка хуже,
   *  чем хотелось бы, но зато не зависит от текста, который правится чаще */
  id: string;
  noteId: string;
  noteTitle: string;
  noteType?: string;
  heading: string;
  /** Markdown раздела, картинки вырезаны — обложка показывается отдельно */
  markdown: string;
  /** Подпись датировки заметки, если она есть */
  period: string | null;
  image: string | null;
  length: number;
  /** Порядок показа внутри заметки: 0 — «с чего начинать знакомство» */
  rank: number;
}

export interface FeedStep {
  fragment: Fragment;
  /** Чем этот фрагмент связан с предыдущим */
  via?: {
    fromTitle: string;
    kind: RelationKind;
    label?: string;
  };
}

/**
 * Разделы, которые нечего читать подряд: исходные данные для графа,
 * библиография и вопросы, у которых своё место в учёбе.
 */
const SERVICE_HEADING = /^(связи|источники|карточки|литература)/i;

const MIN_LENGTH = 150;

/**
 * Разделы, которые стоит показывать первыми при знакомстве с заметкой.
 * Встретить понятие через «Суть идеи» лучше, чем через «Датировки, которые
 * любят приводить»: остальное станет понятно на следующих заходах.
 */
const INTRO_HEADING = /^(кратко|короткое определение|суть идеи|о чём|что произошло|общая характеристика)/i;

/** `- [[Ссылка]] — пояснение` */
const LINK_LIST_ITEM = /^\s*[-*]\s*(?:\{[^}]+\}\s*)?\[\[/;

/**
 * Раздел, состоящий из размеченных ссылок, — это исходные данные для графа,
 * даже если он назван «Контекст эпохи». Читать его подряд нечего:
 * приложение показывает те же связи содержательнее.
 */
function isLinkList(lines: string[]): boolean {
  const meaningful = lines.filter((l) => l.trim());
  if (meaningful.length === 0) return true;
  const links = meaningful.filter((l) => LINK_LIST_ITEM.test(l)).length;
  return links / meaningful.length > 0.5;
}

function stripImages(markdown: string): string {
  return markdown
    .replace(/!\[\[[^\]]+\]\]\s*/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)\s*/g, '')
    .trim();
}

/** Длина видимого текста — по ней отсеиваем огрызки вроде «требуется источник» */
function plainLength(markdown: string): number {
  return markdown
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => alias || target)
    .replace(/[*`>#-]/g, '')
    .trim().length;
}

export function buildFragments(notes: ArcheNote[], graph: KnowledgeGraph): Fragment[] {
  const fragments: Fragment[] = [];

  for (const note of notes) {
    if (note.type === 'quiz' || note.type === 'hub') continue;

    const time = graph.nodeById.get(note.id)?.time;
    const period = time
      ? time.endYear !== undefined && time.endYear !== time.startYear
        ? `${formatYear(time.startYear, time.precision)} — ${formatYear(time.endYear, time.precision)}`
        : formatYear(time.startYear, time.precision)
      : null;
    const image = firstImageOf(note.body);

    const parts = note.body.split(/^##\s+/m).slice(1);
    const ofNote: Fragment[] = [];

    parts.forEach((part, index) => {
      const lines = part.split(/\r?\n/);
      const heading = (lines.shift() ?? '').trim();
      if (!heading || SERVICE_HEADING.test(heading)) return;
      if (isLinkList(lines)) return;

      const markdown = stripImages(lines.join('\n'));
      const length = plainLength(markdown);
      if (length < MIN_LENGTH) return;

      ofNote.push({
        id: `${note.id}#${index}`,
        noteId: note.id,
        noteTitle: note.title,
        noteType: note.type,
        heading,
        markdown,
        period,
        image,
        length,
        rank: INTRO_HEADING.test(heading) ? 0 : index + 1,
      });
    });

    ofNote.sort((a, b) => a.rank - b.rank);
    fragments.push(...ofNote);
  }

  return fragments;
}

/** Детерминированный генератор: одна и та же лента при перерисовке */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(list: T[], random: () => number): T | undefined {
  return list.length ? list[Math.floor(random() * list.length)] : undefined;
}

export interface FeedOptions {
  graph: KnowledgeGraph;
  fragments: Fragment[];
  /** Уже прочитанные фрагменты: их показываем в последнюю очередь */
  seen: Record<string, string>;
  seed: number;
  length: number;
  /** Не повторять заметки, попавшие в ленту раньше в этой же сессии */
  exclude?: Set<string>;
}

/** После скольких шагов подряд по одной ветке уходим в другую часть графа */
const DRIFT_LIMIT = 4;

export function buildFeed({
  graph,
  fragments,
  seen,
  seed,
  length,
  exclude,
}: FeedOptions): FeedStep[] {
  if (fragments.length === 0) return [];

  const byNote = new Map<string, Fragment[]>();
  for (const fragment of fragments) {
    const list = byNote.get(fragment.noteId);
    if (list) list.push(fragment);
    else byNote.set(fragment.noteId, [fragment]);
  }

  const random = mulberry32(seed);
  const usedFragments = new Set<string>(exclude ?? []);
  const visitedNotes = new Set<string>();
  const steps: FeedStep[] = [];

  /**
   * Ещё не прочитанное важнее: лента должна приносить новое, а не крутить одно.
   * Порядок внутри заметки сохраняем — фрагменты уже отсортированы так,
   * чтобы знакомство начиналось с сути.
   */
  const freshFirst = (list: Fragment[]): Fragment[] => {
    const available = list.filter((f) => !usedFragments.has(f.id));
    const unseen = available.filter((f) => !seen[f.id]);
    return unseen.length ? unseen : available;
  };

  const notesWithMaterial = (): string[] =>
    [...byNote.keys()].filter((id) => freshFirst(byNote.get(id)!).length > 0);

  const jump = (): string | undefined => {
    const candidates = notesWithMaterial().filter((id) => !visitedNotes.has(id));
    return pick(candidates.length ? candidates : notesWithMaterial(), random);
  };

  let currentNote = jump();
  let driftLength = 0;
  let via: FeedStep['via'];

  while (currentNote && steps.length < length) {
    const available = freshFirst(byNote.get(currentNote) ?? []);
    // Берём первый, а не случайный: заметка открывается своей сутью
    const fragment = available[0];

    if (!fragment) {
      currentNote = jump();
      via = undefined;
      driftLength = 0;
      continue;
    }

    steps.push({ fragment, via });
    usedFragments.add(fragment.id);
    visitedNotes.add(currentNote);

    // Куда идти дальше: к соседу по смысловой связи
    const neighbours = (graph.adjacent.get(currentNote) ?? [])
      .filter((edge) => RELATION_META[edge.kind].genealogical)
      .map((edge) => {
        const otherId = edge.sourceId === currentNote ? edge.targetId : edge.sourceId;
        return { edge, otherId };
      })
      .filter(
        ({ otherId }) =>
          !visitedNotes.has(otherId) && freshFirst(byNote.get(otherId) ?? []).length > 0
      );

    const next = driftLength >= DRIFT_LIMIT ? undefined : pick(neighbours, random);

    if (next) {
      const fromTitle = graph.nodeById.get(currentNote)?.title ?? '';
      via = {
        fromTitle,
        kind: next.edge.kind,
        label: next.edge.labels[0],
      };
      currentNote = next.otherId;
      driftLength += 1;
    } else {
      // Ветка кончилась или мы слишком долго шли по одной линии
      currentNote = jump();
      via = undefined;
      driftLength = 0;
    }
  }

  return steps;
}
