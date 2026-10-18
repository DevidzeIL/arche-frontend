/**
 * База знаний из Wikidata: войны, сражения, течения, религии, народы,
 * эпохи — и связи между ними и с людьми. Собирается скриптом
 * scripts/build-kb.mjs, лежит в public/kb/.
 *
 * Здесь нет чужого текста: названия, годы, координаты, описания в одну
 * строку и ссылки между элементами. Справка Википедии подгружается
 * отдельно, по запросу (см. wikipedia.ts).
 */

export type KbType = 'war' | 'battle' | 'movement' | 'religion' | 'nation' | 'period';

export interface KbItem {
  t: KbType;
  /** Название */
  n: string;
  /** Описание в одну строку */
  d?: string;
  /** Годы */
  f?: number;
  e?: number;
  /** Точка на карте */
  c?: [number, number];
  /** Статья русской или (если её нет) английской Википедии */
  ru?: string;
  en?: string;
  /** Течение: философия, искусство, литература, архитектура */
  k?: string;
  /** Война: стороны, лица (монархи, полководцы), причины, последствия, сражения, погибшие */
  p?: string[];
  ld?: string[];
  ca?: string[];
  ef?: string[];
  b?: string[];
  dead?: number;
  /** Сражение: война, частью которой было */
  w?: string;
  /** Часть чего: война большей войны, эпоха — эпохи */
  of?: string[];
  /** Основатели; страна или место происхождения */
  fo?: string[];
  o?: string[];
  /** Религия: от чего отделилась */
  pa?: string[];
  /** Народ: языки, религии, численность */
  lang?: string[];
  rel?: string[];
  pop?: number;
  /** Эпоха: предыдущая и следующая */
  prev?: string[];
  next?: string[];
}

export interface Kb {
  types: Record<KbType, string>;
  movementKinds: Record<string, string>;
  items: Record<string, KbItem>;
  /** Подписи к тому, на что ссылаются, но чего нет среди items */
  labels: Record<string, string>;
}

/** [имя, год рождения, год смерти] */
export type KbPerson = [string, number | null, number | null];

export interface KbLinks {
  persons: Record<string, KbPerson>;
  /** Течение → его представители, известные первыми */
  members: Record<string, string[]>;
  /** Человек → его течения */
  movementsOf: Record<string, string[]>;
  /** [кто повлиял, на кого] */
  influence: Array<[string, string]>;
}

const fetchOrNull = <T>(url: string): Promise<T | null> =>
  fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null);

let kbPromise: Promise<Kb | null> | null = null;
let linksPromise: Promise<KbLinks | null> | null = null;
let vaultPromise: Promise<Record<string, string> | null> | null = null;

/** null — база не собрана (pnpm kb) */
export function loadKb(): Promise<Kb | null> {
  kbPromise ??= fetchOrNull<Kb>('/kb/kb.json');
  return kbPromise;
}

export function loadKbLinks(): Promise<KbLinks | null> {
  linksPromise ??= fetchOrNull<KbLinks>('/kb/links.json');
  return linksPromise;
}

/** Заметка хранилища → элемент Wikidata (поле `wikidata:` в заметке важнее) */
export function loadVaultLinks(): Promise<Record<string, string> | null> {
  vaultPromise ??= fetchOrNull<Record<string, string>>('/kb/vault.json');
  return vaultPromise;
}

/** Название чего угодно по идентификатору: сущность, подпись или человек */
export function nameOf(kb: Kb | null, links: KbLinks | null, id: string): string | null {
  return kb?.items[id]?.n ?? kb?.labels[id] ?? links?.persons[id]?.[0] ?? null;
}

export function typeLabel(kb: Kb, item: KbItem): string {
  if (item.t === 'movement' && item.k) return `${kb.types.movement} · ${kb.movementKinds[item.k] ?? item.k}`;
  return kb.types[item.t] ?? item.t;
}

const influenceIndex = new WeakMap<KbLinks, { by: Map<string, string[]>; on: Map<string, string[]> }>();

/** Кто повлиял на человека и на кого повлиял он */
export function influenceOf(links: KbLinks, id: string): { by: string[]; on: string[] } {
  let index = influenceIndex.get(links);
  if (!index) {
    const by = new Map<string, string[]>();
    const on = new Map<string, string[]>();
    for (const [from, to] of links.influence) {
      (by.get(to) ?? by.set(to, []).get(to)!).push(from);
      (on.get(from) ?? on.set(from, []).get(from)!).push(to);
    }
    index = { by, on };
    influenceIndex.set(links, index);
  }
  return { by: index.by.get(id) ?? [], on: index.on.get(id) ?? [] };
}

/**
 * Сражения войны вместе со сражениями её частей. У Тридцатилетней войны
 * в Wikidata своих сражений нет — они привязаны к «датскому» и «шведскому»
 * периодам; без этого война на карте была бы пустой
 */
export function battlesOf(kb: Kb, id: string): string[] {
  const own = kb.items[id]?.b ?? [];
  const parts = backlinksOf(kb, id)
    .filter((r) => r.rel === 'part' && kb.items[r.id]?.t === 'war')
    .flatMap((r) => kb.items[r.id].b ?? []);
  return [...new Set([...own, ...parts])];
}

const reverseIndex = new WeakMap<Kb, Map<string, Array<{ id: string; rel: string }>>>();

/**
 * Обратные связи: что ссылается на этот элемент. Для религии — её ветви,
 * для эпохи — её части, для войны — войны, в которые она входит.
 */
export function backlinksOf(kb: Kb, id: string): Array<{ id: string; rel: string }> {
  let index = reverseIndex.get(kb);
  if (!index) {
    index = new Map();
    for (const [source, item] of Object.entries(kb.items)) {
      const add = (target: string, rel: string) => {
        const list = index!.get(target) ?? [];
        list.push({ id: source, rel });
        index!.set(target, list);
      };
      for (const t of item.pa ?? []) add(t, 'branch');
      for (const t of item.of ?? []) add(t, 'part');
      for (const t of [...(item.p ?? []), ...(item.ld ?? [])]) add(t, 'war');
      for (const t of item.ca ?? []) add(t, 'caused');
      for (const t of item.ef ?? []) add(t, 'effectOf');
    }
    reverseIndex.set(kb, index);
  }
  return index.get(id) ?? [];
}

export function yearsOf(item: { f?: number; e?: number }, format: (y: number) => string): string | null {
  if (item.f === undefined) return null;
  if (item.e === undefined || item.e === item.f) return format(item.f);
  return `${format(item.f)} — ${format(item.e)}`;
}
