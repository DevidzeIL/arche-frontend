/**
 * Справочный слой: всё, что пришло из Wikidata, под одним идентификатором.
 *
 * У Семилетней войны, Королевства Пруссия, Вольтера и Лиссабонского
 * землетрясения разные источники — база знаний, сведения о государствах,
 * фон «а в это время», — но для читателя это одно: справка, у которой
 * есть страница /kb/<id> и связи с остальным.
 *
 * Модуль лёгкий намеренно: им пользуется и палитра поиска, а она живёт
 * в главном бандле. Поэтому никаких d3 и границ — только JSON.
 */
import { loadContext, type ContextData, type ContextEvent, type ContextPerson } from './context';
import { loadKb, loadKbLinks, typeLabel, yearsOf, type Kb, type KbItem, type KbLinks, type KbPerson } from './kb';
import { normalizeTitle } from './normalize';
import { formatYear } from './timeSpan';
import type { BordersIndex, PolityEntry } from './bordersData';

export interface ReferenceEntry {
  id: string;
  title: string;
  /** «Война · 1756 — 1763», «Государство · 1702–1863» */
  sub: string;
  /** Нормализованное название — для поиска */
  key: string;
}

let indexPromise: Promise<BordersIndex | null> | null = null;

/** Индекс государств без загрузки границ */
export function loadPolityIndex(): Promise<BordersIndex | null> {
  indexPromise ??= fetch('/borders/index.json')
    .then((r) => (r.ok ? (r.json() as Promise<BordersIndex>) : null))
    .catch(() => null);
  return indexPromise;
}

let entriesPromise: Promise<ReferenceEntry[]> | null = null;

/**
 * Всё справочное одним списком. Государство с несколькими строками
 * Cliopatria (базовое и объединение) попадает один раз — по элементу Wikidata.
 */
export function loadReferenceEntries(): Promise<ReferenceEntry[]> {
  entriesPromise ??= Promise.all([loadKb(), loadContext(), loadPolityIndex()]).then(([kb, context, index]) => {
    const out: ReferenceEntry[] = [];
    const seen = new Set<string>();
    const push = (id: string, title: string, sub: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ id, title, sub, key: normalizeTitle(title) });
    };
    if (kb) {
      for (const [id, item] of Object.entries(kb.items)) {
        push(id, item.n, [typeLabel(kb, item), yearsOf(item, formatYear)].filter(Boolean).join(' · '));
      }
    }
    if (index) {
      for (const p of index.polities) {
        if (!p.q || p.u) continue;
        push(p.q, p.ru ?? p.n, `Государство · ${formatYear(p.f)}–${p.t >= 2024 ? 'наши дни' : formatYear(p.t)}`);
      }
    }
    if (context) {
      for (const e of context.events) push(e.id, e.title, `${context.kinds[e.kind] ?? 'Событие'} · ${formatYear(e.year)}`);
      for (const p of context.people) {
        push(p.id, p.title, `${context.groups[p.group] ?? 'Человек'} · ${formatYear(p.birth)}${p.death ? `–${formatYear(p.death)}` : ''}`);
      }
    }
    return out;
  });
  return entriesPromise;
}

/** Совпадение с начала названия выше, чем в середине; короткие названия выше длинных */
export function searchReference(entries: ReferenceEntry[], query: string, limit: number): ReferenceEntry[] {
  const q = normalizeTitle(query);
  if (q.length < 2) return [];
  const scored: Array<{ entry: ReferenceEntry; score: number }> = [];
  for (const entry of entries) {
    const at = entry.key.indexOf(q);
    if (at < 0) continue;
    scored.push({ entry, score: at === 0 ? 3 : entry.key.includes(` ${q}`) ? 2 : 1 });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.entry.title.length - b.entry.title.length)
    .slice(0, limit)
    .map((s) => s.entry);
}

export type ResolvedEntity =
  | { kind: 'kb'; id: string; item: KbItem }
  | { kind: 'event'; id: string; event: ContextEvent }
  | { kind: 'person'; id: string; person: ContextPerson | null; known: KbPerson | null }
  | { kind: 'polity'; id: string; entries: PolityEntry[] }
  | null;

export interface ReferenceData {
  kb: Kb | null;
  links: KbLinks | null;
  context: ContextData | null;
  index: BordersIndex | null;
}

export async function loadReferenceData(): Promise<ReferenceData> {
  const [kb, links, context, index] = await Promise.all([loadKb(), loadKbLinks(), loadContext(), loadPolityIndex()]);
  return { kb, links, context, index };
}

export function resolveEntity(data: ReferenceData, id: string): ResolvedEntity {
  const item = data.kb?.items[id];
  if (item) return { kind: 'kb', id, item };
  const polities = data.index?.polities.filter((p) => p.q === id) ?? [];
  if (polities.length > 0) return { kind: 'polity', id, entries: polities };
  const event = data.context?.events.find((e) => e.id === id);
  if (event) return { kind: 'event', id, event };
  const person = data.context?.people.find((p) => p.id === id) ?? null;
  const known = data.links?.persons[id] ?? null;
  if (person || known) return { kind: 'person', id, person, known };
  return null;
}
