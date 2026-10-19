/**
 * Фон «а в это время»: события и люди из Wikidata (CC0).
 *
 * Это не заметки и никогда ими не станет: только название, год, точка
 * и ссылка на статью. Собирается скриптом scripts/build-context.mjs,
 * лежит в public/context/ и грузится при открытии глобуса.
 *
 * Если человек уже есть в хранилище, фоновая точка для него не рисуется —
 * своя заметка всегда важнее чужой справки.
 */
import { normalizeTitle } from './normalize';

export interface ContextEvent {
  id: string;
  title: string;
  description: string | null;
  year: number;
  /** Конец, если событие длилось: войны, соборы, стройки */
  end: number | null;
  lon: number;
  lat: number;
  place: string | null;
  kind: string;
  /** Сколько языковых версий у статьи — грубая мера известности */
  links: number;
  ru: string | null;
  en: string | null;
}

export interface ContextPerson {
  id: string;
  title: string;
  description: string | null;
  birth: number;
  death: number | null;
  lon: number;
  lat: number;
  /** Место рождения: так в Wikidata, а не «где работал» */
  place: string | null;
  deathPlace: string | null;
  /** Место смерти точкой — для линии жизни; null — неизвестно */
  dlon: number | null;
  dlat: number | null;
  group: string;
  links: number;
  ru: string | null;
  en: string | null;
}

export interface ContextData {
  events: ContextEvent[];
  people: ContextPerson[];
  kinds: Record<string, string>;
  groups: Record<string, string>;
}

interface Packed {
  fields: string[];
  rows: unknown[][];
}

function unpack<T>({ fields, rows }: Packed): T[] {
  return rows.map((row) => Object.fromEntries(fields.map((field, i) => [field, row[i]])) as T);
}

let promise: Promise<ContextData | null> | null = null;

/** null — фон не собран (pnpm context); глобус работает и без него */
export function loadContext(): Promise<ContextData | null> {
  promise ??= Promise.all([
    fetch('/context/events.json').then((r) => (r.ok ? r.json() : null)),
    fetch('/context/people.json').then((r) => (r.ok ? r.json() : null)),
  ])
    .then(([events, people]) => {
      if (!events || !people) return null;
      return {
        events: unpack<ContextEvent>(events),
        people: unpack<ContextPerson>(people),
        kinds: events.kinds,
        groups: people.groups,
      };
    })
    .catch(() => null);
  return promise;
}

/**
 * Насколько широко понимать «в это время».
 *
 * В XX веке десять лет — другая эпоха, в бронзовом веке столетие —
 * погрешность датировки. Окно растёт вглубь истории.
 */
export function windowFor(year: number): number {
  if (year >= 1800) return 10;
  if (year >= 1500) return 20;
  if (year >= 500) return 40;
  if (year >= -500) return 60;
  return 150;
}

/** Если год смерти неизвестен, считаем, что человек прожил семьдесят лет */
const ASSUMED_LIFESPAN = 70;

export function isAlive(person: ContextPerson, year: number): boolean {
  const death = person.death ?? person.birth + ASSUMED_LIFESPAN;
  return person.birth <= year && year <= death;
}

/** Фон без тех, кто уже есть в хранилище: своя заметка важнее */
export function withoutVaultDuplicates(data: ContextData, titles: Set<string>): ContextData {
  const known = (title: string) => titles.has(normalizeTitle(title));
  return {
    ...data,
    events: data.events.filter((e) => !known(e.title)),
    people: data.people.filter((p) => !known(p.title)),
  };
}

/** События, идущие в этот год или рядом с ним: война 1618–1648 видна весь свой срок */
export function eventsAround(data: ContextData, year: number, limit: number): ContextEvent[] {
  const window = windowFor(year);
  return data.events
    .filter((e) => e.year - window <= year && year <= (e.end ?? e.year) + window)
    .slice(0, limit);
}

export function peopleAlive(data: ContextData, year: number, limit: number): ContextPerson[] {
  return data.people.filter((p) => isAlive(p, year)).slice(0, limit);
}
