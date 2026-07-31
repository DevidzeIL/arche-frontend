/**
 * Учебная программа, собранная из vault'а.
 *
 * Курс — это хаб (type: hub). Глава — раздел «## … ось …» внутри хаба.
 * Уроки — нумерованный список wikilink'ов в разделе вместе с подписями.
 *
 * Дубля структуры в коде нет намеренно: правишь хаб в Obsidian —
 * меняется курс. Vault остаётся единственным источником истины.
 */
import type { ArcheNote } from '../types';
import { normalizeTitle } from '../normalize';

export interface Lesson {
  noteId: string;
  title: string;
  /** Подпись из хаба: «объяснение как родословная» */
  hook?: string;
}

export interface Chapter {
  /** Стабильный ключ для хранения прогресса */
  id: string;
  index: number;
  /** «миф → логос» */
  title: string;
  /** «Первая ось» */
  ordinal?: string;
  /** Абзац между заголовком и списком уроков, если есть */
  intro?: string;
  lessons: Lesson[];
}

export interface Course {
  hubId: string;
  title: string;
  hub: ArcheNote;
  chapters: Chapter[];
}

const HEADING = /^##\s+(.+?)\s*$/;
const LESSON = /^\s*\d+\.\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*(?:—\s*(.+?))?\s*$/;

export function buildCourses(notes: ArcheNote[]): Course[] {
  const byTitle = new Map(notes.map((n) => [normalizeTitle(n.title), n]));

  return notes
    .filter((n) => n.type === 'hub')
    .map((hub) => ({
      hubId: hub.id,
      title: hub.title,
      hub,
      chapters: parseChapters(hub, byTitle),
    }))
    .filter((course) => course.chapters.length > 0);
}

function parseChapters(hub: ArcheNote, byTitle: Map<string, ArcheNote>): Chapter[] {
  const chapters: Chapter[] = [];
  let current: Chapter | null = null;
  let axisCount = 0;
  const intro: string[] = [];

  const flush = () => {
    // Глава из одного урока тестом не станет — пропускаем
    if (current && current.lessons.length >= 2) chapters.push(current);
    current = null;
    intro.length = 0;
  };

  for (const line of hub.body.split(/\r?\n/)) {
    const heading = line.match(HEADING);
    if (heading) {
      flush();
      if (/ось/i.test(heading[1])) {
        const [left, right] = heading[1].split(':').map((s) => s.trim());
        current = {
          id: `${hub.id}:${axisCount}`,
          index: axisCount,
          title: right || left,
          ordinal: right ? left : undefined,
          lessons: [],
        };
        axisCount += 1;
      }
      continue;
    }
    if (!current) continue;

    const lesson = line.match(LESSON);
    if (lesson) {
      const note = byTitle.get(normalizeTitle(lesson[1]));
      if (note) current.lessons.push({ noteId: note.id, title: note.title, hook: lesson[2] });
      continue;
    }

    // Абзац до первого урока — введение главы
    if (current.lessons.length === 0 && line.trim() && !line.startsWith('#')) {
      intro.push(line.trim());
      current.intro = intro.join(' ');
    }
  }
  flush();

  return chapters;
}
