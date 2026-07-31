/**
 * Прогресс обучения: XP, стрик, прочитанные уроки, результаты глав,
 * состояние карточек интервального повторения.
 *
 * АРХИТЕКТУРНОЕ РЕШЕНИЕ: аккаунт локальный. Весь прогресс лежит в одном
 * сторе с отдельным ключом localStorage и сериализуется в один JSON
 * (exportData/importData — это и перенос между устройствами, и бэкап).
 *
 * Когда понадобится синхронизация (несколько устройств, другие люди),
 * сюда подключается бэкенд: этот JSON целиком кладётся в Supabase
 * (таблица progress: user_id, data jsonb, updated_at + RLS), а UI
 * не меняется вовсе — он знает только этот стор.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { reviewCard, type CardState } from './srs';

export const PASS_SCORE = 0.8;

export interface ChapterProgress {
  attempts: number;
  bestScore: number;
  completedAt?: string;
}

interface Totals {
  answered: number;
  correct: number;
}

interface ProgressData {
  version: 1;
  name: string;
  createdAt: string;
  xp: number;
  streak: number;
  lastActiveDay: string | null;
  /** noteId -> дата первого прочтения */
  lessonsRead: Record<string, string>;
  chapters: Record<string, ChapterProgress>;
  cards: Record<string, CardState>;
  totals: Totals;
}

interface ProgressActions {
  rename(name: string): void;
  markLessonRead(noteId: string): void;
  recordAnswer(cardId: string, correct: boolean): void;
  completeQuiz(chapterId: string, score: number): void;
  pruneCards(ids: string[]): void;
  exportData(): string;
  importData(json: string): boolean;
  resetAll(): void;
}

export type ProgressStore = ProgressData & ProgressActions;

export function levelFromXp(xp: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

/** XP, с которого начинается уровень */
export function levelFloor(level: number): number {
  return 100 * (level - 1) * (level - 1);
}

/** XP, на котором начнётся следующий */
export function levelCeil(level: number): number {
  return 100 * level * level;
}

function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isYesterday(day: string, now = new Date()): boolean {
  return day === localDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

/** Любая учебная активность продлевает стрик, но день считается один раз */
function touched(state: Pick<ProgressData, 'streak' | 'lastActiveDay'>): Partial<ProgressData> {
  const today = localDay();
  if (state.lastActiveDay === today) return {};
  return {
    lastActiveDay: today,
    streak: state.lastActiveDay && isYesterday(state.lastActiveDay) ? state.streak + 1 : 1,
  };
}

function initialData(): ProgressData {
  return {
    version: 1,
    name: 'Исследователь',
    createdAt: new Date().toISOString(),
    xp: 0,
    streak: 0,
    lastActiveDay: null,
    lessonsRead: {},
    chapters: {},
    cards: {},
    totals: { answered: 0, correct: 0 },
  };
}

export const XP = {
  lessonRead: 5,
  correctAnswer: 10,
  wrongAnswer: 2,
  chapterCompleted: 30,
} as const;

export const useProgressStore = create<ProgressStore>()(
  persist(
    (set, get) => ({
      ...initialData(),

      rename: (name) => {
        const trimmed = name.trim();
        if (trimmed) set({ name: trimmed.slice(0, 40) });
      },

      markLessonRead: (noteId) => {
        set((s) => {
          if (s.lessonsRead[noteId]) return {};
          return {
            ...touched(s),
            xp: s.xp + XP.lessonRead,
            lessonsRead: { ...s.lessonsRead, [noteId]: new Date().toISOString() },
          };
        });
      },

      recordAnswer: (cardId, correct) => {
        set((s) => ({
          ...touched(s),
          xp: s.xp + (correct ? XP.correctAnswer : XP.wrongAnswer),
          totals: {
            answered: s.totals.answered + 1,
            correct: s.totals.correct + (correct ? 1 : 0),
          },
          cards: { ...s.cards, [cardId]: reviewCard(s.cards[cardId], correct) },
        }));
      },

      completeQuiz: (chapterId, score) => {
        set((s) => {
          const prev = s.chapters[chapterId] ?? { attempts: 0, bestScore: 0 };
          const passedFirstTime = score >= PASS_SCORE && !prev.completedAt;
          return {
            ...touched(s),
            xp: s.xp + (passedFirstTime ? XP.chapterCompleted : 0),
            chapters: {
              ...s.chapters,
              [chapterId]: {
                attempts: prev.attempts + 1,
                bestScore: Math.max(prev.bestScore, score),
                completedAt:
                  prev.completedAt ?? (score >= PASS_SCORE ? new Date().toISOString() : undefined),
              },
            },
          };
        });
      },

      pruneCards: (ids) => {
        if (ids.length === 0) return;
        set((s) => {
          const cards = { ...s.cards };
          ids.forEach((id) => delete cards[id]);
          return { cards };
        });
      },

      exportData: () => {
        const s = get();
        const data: ProgressData = {
          version: s.version,
          name: s.name,
          createdAt: s.createdAt,
          xp: s.xp,
          streak: s.streak,
          lastActiveDay: s.lastActiveDay,
          lessonsRead: s.lessonsRead,
          chapters: s.chapters,
          cards: s.cards,
          totals: s.totals,
        };
        return JSON.stringify(data, null, 2);
      },

      importData: (json) => {
        try {
          const data = JSON.parse(json) as ProgressData;
          if (data.version !== 1 || typeof data.xp !== 'number' || typeof data.cards !== 'object') {
            return false;
          }
          set(data);
          return true;
        } catch {
          return false;
        }
      },

      resetAll: () => set(initialData()),
    }),
    {
      name: 'arche-progress',
      partialize: (s) => ({
        version: s.version,
        name: s.name,
        createdAt: s.createdAt,
        xp: s.xp,
        streak: s.streak,
        lastActiveDay: s.lastActiveDay,
        lessonsRead: s.lessonsRead,
        chapters: s.chapters,
        cards: s.cards,
        totals: s.totals,
      }),
    }
  )
);
