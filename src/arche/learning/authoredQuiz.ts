/**
 * Авторские тесты из vault'а.
 *
 * Тест — заметка type: quiz. Вопрос — раздел «## …», варианты — чекбоксы,
 * правильный помечен [x], пояснение — цитатой:
 *
 *   ## Чем ответ логоса отличается от ответа мифа?
 *   - [ ] Он короче
 *   - [x] С ним можно спорить
 *   - [ ] Он всегда верен
 *   > Правило можно проверить и оспорить; родословную — только пересказать.
 *
 * Пишутся в Obsidian как обычные заметки. Прогресс и интервальное
 * повторение работают с ними так же, как с автогенерируемыми вопросами.
 */
import type { ArcheNote } from '../types';
import type { QuizQuestion } from './quiz';

export interface AuthoredQuiz {
  noteId: string;
  title: string;
  description?: string;
  questions: QuizQuestion[];
}

const OPTION = /^-\s*\[( |x|X)\]\s*(.+)$/;

/** Стабильный хэш текста вопроса — идентичность карточки для SRS */
function hashPrompt(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function parseAuthoredQuiz(note: ArcheNote): AuthoredQuiz | null {
  if (note.type !== 'quiz') return null;

  const sections = note.body.split(/^##\s+/m);
  const preamble = sections.shift() ?? '';
  const description = preamble
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith('!['))
    .join(' ')
    .trim();

  const questions: QuizQuestion[] = [];

  for (const section of sections) {
    const lines = section.split(/\r?\n/);
    const heading = (lines.shift() ?? '').trim();
    if (!heading) continue;

    const promptExtra: string[] = [];
    const options: { label: string; correct: boolean }[] = [];
    const explanation: string[] = [];

    for (const line of lines) {
      const opt = line.match(OPTION);
      if (opt) {
        options.push({ label: opt[2].trim(), correct: opt[1].toLowerCase() === 'x' });
      } else if (line.trim().startsWith('>')) {
        explanation.push(line.replace(/^\s*>\s?/, '').trim());
      } else if (options.length === 0 && line.trim()) {
        promptExtra.push(line.trim());
      }
    }

    const correctIndex = options.findIndex((o) => o.correct);
    if (options.length < 2 || correctIndex < 0) continue;

    const prompt = [heading, ...promptExtra].join('\n');
    const cardId = `aq:${note.id}:${hashPrompt(prompt)}`;

    questions.push({
      cardId,
      prompt,
      // Перемешивание при каждом разборе: позицию ответа не зазубрить
      options: shuffle(options.map((o, i) => ({ id: `o${i}`, label: o.label }))),
      correctId: `o${correctIndex}`,
      explanation: explanation.join(' ') || undefined,
      noteId: undefined,
    });
  }

  if (questions.length === 0) return null;
  return { noteId: note.id, title: note.title, description: description || undefined, questions };
}

export function listAuthoredQuizzes(notes: ArcheNote[]): AuthoredQuiz[] {
  return notes
    .map(parseAuthoredQuiz)
    .filter((q): q is AuthoredQuiz => q !== null);
}

/** cardId → вопрос: для сессий повторения */
export function buildAuthoredIndex(notes: ArcheNote[]): Map<string, QuizQuestion> {
  const index = new Map<string, QuizQuestion>();
  for (const quiz of listAuthoredQuizzes(notes)) {
    for (const q of quiz.questions) index.set(q.cardId, q);
  }
  return index;
}
