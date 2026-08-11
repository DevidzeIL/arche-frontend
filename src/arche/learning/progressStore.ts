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
import { reviewCard, toGrade, type CardState, type ReviewGrade } from './srs';

export const PASS_SCORE = 0.8;

/** Версия формата данных: с ней сверяется импорт */
export const DATA_VERSION = 3;

/** Сколько карточек в день по умолчанию — примерно пять минут */
export const DEFAULT_DAILY_GOAL = 15;

export const DAILY_GOAL_CHOICES = [8, 15, 25, 40];

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
  version: number;
  name: string;
  createdAt: string;
  xp: number;
  streak: number;
  /** Лучший стрик за всё время — его жалко терять, и он мотивирует вернуться */
  bestStreak: number;
  lastActiveDay: string | null;
  /** Сколько карточек в день считается выполненной нормой */
  dailyGoal: number;
  /** день (YYYY-MM-DD) -> сколько карточек отвечено; основа календаря активности */
  history: Record<string, number>;
  /**
   * день -> сколько карточек увидено впервые. Отдельно от history, потому что
   * новый материал ограничивается своей нормой: взять сегодня сорок новых
   * карточек значит получить сорок повторений послезавтра.
   */
  newHistory: Record<string, number>;
  /** noteId -> дата первого прочтения */
  lessonsRead: Record<string, string>;
  /** id фрагмента ленты -> дата прочтения; лента по нему не гоняет одно и то же */
  feedSeen: Record<string, string>;
  chapters: Record<string, ChapterProgress>;
  cards: Record<string, CardState>;
  totals: Totals;
}

interface ProgressActions {
  rename(name: string): void;
  setDailyGoal(goal: number): void;
  markLessonRead(noteId: string): void;
  /** Фрагмент ленты дочитан и ушёл вверх экрана */
  markFragmentRead(fragmentId: string): void;
  /** Завести карточки заметки в колоду со сроком «сегодня» */
  seedCards(cardIds: string[]): void;
  /** Ответ на вопрос теста (boolean) или самооценка карточки (ReviewGrade) */
  recordAnswer(cardId: string, result: boolean | ReviewGrade): void;
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

export function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + delta));
}

function isYesterday(day: string, now = new Date()): boolean {
  return day === localDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

/** Любая учебная активность продлевает стрик, но день считается один раз */
function touched(
  state: Pick<ProgressData, 'streak' | 'bestStreak' | 'lastActiveDay'>
): Partial<ProgressData> {
  const today = localDay();
  if (state.lastActiveDay === today) return {};
  const streak = state.lastActiveDay && isYesterday(state.lastActiveDay) ? state.streak + 1 : 1;
  return {
    lastActiveDay: today,
    streak,
    bestStreak: Math.max(state.bestStreak ?? 0, streak),
  };
}

/** История активности за последние 180 дней — на большее календарь не смотрит */
function trimHistory(history: Record<string, number>): Record<string, number> {
  const cutoff = shiftDay(localDay(), -180);
  const trimmed: Record<string, number> = {};
  for (const [day, count] of Object.entries(history)) {
    if (day >= cutoff) trimmed[day] = count;
  }
  return trimmed;
}

function initialData(): ProgressData {
  return {
    version: DATA_VERSION,
    name: 'Исследователь',
    createdAt: new Date().toISOString(),
    xp: 0,
    streak: 0,
    bestStreak: 0,
    lastActiveDay: null,
    dailyGoal: DEFAULT_DAILY_GOAL,
    history: {},
    newHistory: {},
    lessonsRead: {},
    feedSeen: {},
    chapters: {},
    cards: {},
    totals: { answered: 0, correct: 0 },
  };
}

export const XP = {
  lessonRead: 5,
  chapterCompleted: 30,
  /** Фрагмент ленты — меньше карточки: прочитать легче, чем вспомнить */
  fragmentRead: 2,
} as const;

/** XP за карточку зависит от честности самооценки: «легко» стоит дороже «не помню» */
const XP_BY_GRADE: Record<ReviewGrade, number> = {
  again: 2,
  hard: 6,
  good: 10,
  easy: 12,
};

const PERSISTED_KEYS: (keyof ProgressData)[] = [
  'version',
  'name',
  'createdAt',
  'xp',
  'streak',
  'bestStreak',
  'lastActiveDay',
  'dailyGoal',
  'history',
  'newHistory',
  'lessonsRead',
  'feedSeen',
  'chapters',
  'cards',
  'totals',
];

function pickData(state: ProgressData): ProgressData {
  const out = {} as ProgressData;
  for (const key of PERSISTED_KEYS) {
    // @ts-expect-error — ключи берутся из того же типа
    out[key] = state[key];
  }
  return out;
}

export const useProgressStore = create<ProgressStore>()(
  persist(
    (set, get) => ({
      ...initialData(),

      rename: (name) => {
        const trimmed = name.trim();
        if (trimmed) set({ name: trimmed.slice(0, 40) });
      },

      setDailyGoal: (goal) => {
        if (Number.isFinite(goal) && goal > 0) set({ dailyGoal: Math.round(goal) });
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

      markFragmentRead: (fragmentId) => {
        set((s) => {
          if (s.feedSeen[fragmentId]) return {};
          return {
            ...touched(s),
            xp: s.xp + XP.fragmentRead,
            feedSeen: { ...s.feedSeen, [fragmentId]: new Date().toISOString() },
          };
        });
      },

      // Карточки заводятся со сроком «сейчас», но в сегодняшнюю норму попадут
      // не все разом: план дня всё равно режет стопку по своему лимиту
      seedCards: (cardIds) => {
        set((s) => {
          const fresh = cardIds.filter((id) => !s.cards[id]);
          if (fresh.length === 0) return {};

          const now = new Date().toISOString();
          const cards = { ...s.cards };
          for (const id of fresh) {
            cards[id] = { box: 1, dueAt: now, reps: 0, lapses: 0 };
          }
          return { cards };
        });
      },

      recordAnswer: (cardId, result) => {
        const grade = toGrade(result);
        const today = localDay();
        set((s) => ({
          ...touched(s),
          xp: s.xp + XP_BY_GRADE[grade],
          history: trimHistory({ ...s.history, [today]: (s.history[today] ?? 0) + 1 }),
          newHistory: s.cards[cardId]
            ? s.newHistory
            : trimHistory({ ...s.newHistory, [today]: (s.newHistory[today] ?? 0) + 1 }),
          totals: {
            answered: s.totals.answered + 1,
            correct: s.totals.correct + (grade === 'again' ? 0 : 1),
          },
          cards: { ...s.cards, [cardId]: reviewCard(s.cards[cardId], grade) },
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

      exportData: () => JSON.stringify(pickData(get()), null, 2),

      importData: (json) => {
        try {
          const data = JSON.parse(json) as Partial<ProgressData>;
          // Экспорт первой версии тоже принимаем: недостающие поля добираются
          // из значений по умолчанию, терять прогресс из-за формата незачем
          if (
            typeof data.version !== 'number' ||
            data.version > DATA_VERSION ||
            typeof data.xp !== 'number' ||
            typeof data.cards !== 'object'
          ) {
            return false;
          }
          set({ ...initialData(), ...data, version: DATA_VERSION });
          return true;
        } catch {
          return false;
        }
      },

      resetAll: () => set(initialData()),
    }),
    {
      name: 'arche-progress',
      version: DATA_VERSION,
      // Поля, добавленные во второй версии, просто добираются из умолчаний:
      // прогресс первой версии остаётся целым
      migrate: (persisted) => ({
        ...initialData(),
        ...(persisted as Partial<ProgressData>),
        version: DATA_VERSION,
      }),
      partialize: (s) => pickData(s),
    }
  )
);

/** Сколько карточек отвечено сегодня */
export function answeredToday(history: Record<string, number>, now = new Date()): number {
  return history[localDay(now)] ?? 0;
}

/** Последние n дней в хронологическом порядке — для календаря активности */
export function activityDays(
  history: Record<string, number>,
  n: number,
  now = new Date()
): Array<{ day: string; count: number }> {
  const today = localDay(now);
  const days: Array<{ day: string; count: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = shiftDay(today, -i);
    days.push({ day, count: history[day] ?? 0 });
  }
  return days;
}
