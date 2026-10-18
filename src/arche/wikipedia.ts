/**
 * Вступление статьи Википедии — по запросу, в панелях глобуса.
 *
 * Это чужой текст под CC BY-SA, и в хранилище он не попадает никогда:
 * заметки пишутся своими словами (см. README, «Почему ссылки, а не текст»).
 * Но рядом с картой, где человек щёлкнул по Королевству Пруссия, абзац
 * справки с подписью и ссылкой на источник — честный способ ответить
 * «а что это вообще было». Запрашивается живьём, без сети блока просто нет.
 */
import { useEffect, useState } from 'react';

export interface WikiSummary {
  title: string;
  extract: string;
  thumbnail?: string;
  url: string;
  lang: 'ru' | 'en';
}

interface RestSummary {
  type?: string;
  title?: string;
  extract?: string;
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

const cache = new Map<string, Promise<WikiSummary | null>>();

async function fetchOne(lang: 'ru' | 'en', title: string): Promise<WikiSummary | null> {
  const response = await fetch(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    { headers: { Accept: 'application/json' } }
  );
  if (!response.ok) return null;
  const json = (await response.json()) as RestSummary;
  // Страница значений — не ответ, а оглавление
  if (json.type === 'disambiguation' || !json.extract) return null;
  return {
    title: json.title ?? title,
    extract: json.extract,
    thumbnail: json.thumbnail?.source,
    url: json.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    lang,
  };
}

/** Русская статья, а если её нет — английская */
export function fetchSummary(article: { ru?: string | null; en?: string | null }): Promise<WikiSummary | null> {
  const key = `${article.ru ?? ''}|${article.en ?? ''}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = (async () => {
      if (article.ru) {
        const ru = await fetchOne('ru', article.ru).catch(() => null);
        if (ru) return ru;
      }
      return article.en ? fetchOne('en', article.en).catch(() => null) : null;
    })();
    cache.set(key, promise);
  }
  return promise;
}

export function useWikiSummary(article: { ru?: string | null; en?: string | null } | null) {
  const [state, setState] = useState<{ key: string; summary: WikiSummary | null; loading: boolean }>({
    key: '',
    summary: null,
    loading: false,
  });
  const key = article ? `${article.ru ?? ''}|${article.en ?? ''}` : '';

  useEffect(() => {
    if (!article || (!article.ru && !article.en)) {
      setState({ key, summary: null, loading: false });
      return;
    }
    let alive = true;
    setState({ key, summary: null, loading: true });
    fetchSummary(article).then((summary) => alive && setState({ key, summary, loading: false }));
    return () => {
      alive = false;
    };
    // Статья определяется ключом, а не объектом: он создаётся заново на каждый рендер
  }, [key]);

  return state.key === key ? state : { key, summary: null, loading: Boolean(article) };
}

const images = new Map<string, Promise<string | null>>();

/**
 * Изображение элемента Wikidata (P18) — один запрос, когда открыта панель.
 * Держать имена файлов для пяти тысяч людей в общем файле значило бы
 * сделать его на четверть тяжелее ради того, что смотрят по одному.
 */
export function fetchWikidataImage(qid: string): Promise<string | null> {
  let promise = images.get(qid);
  if (!promise) {
    promise = fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&origin=*&property=P18&entity=${qid}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => (json?.claims?.P18?.[0]?.mainsnak?.datavalue?.value as string | undefined) ?? null)
      .catch(() => null);
    images.set(qid, promise);
  }
  return promise;
}

export function useWikidataImage(qid: string | null): string | null {
  const [state, setState] = useState<{ qid: string | null; file: string | null }>({ qid: null, file: null });
  useEffect(() => {
    if (!qid) return;
    let alive = true;
    fetchWikidataImage(qid).then((file) => alive && setState({ qid, file }));
    return () => {
      alive = false;
    };
  }, [qid]);
  return state.qid === qid ? state.file : null;
}
