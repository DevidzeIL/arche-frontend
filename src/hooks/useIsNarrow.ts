import { useEffect, useState } from 'react';

/**
 * Телефонная ширина.
 *
 * Порог не косметический: ниже него двумерная карта перестаёт читаться —
 * две с половиной тысячи лет и пять дорожек в 390 точках дают наложение
 * подписей, а не обзор. Компоненты, которым важно это различие, меняют
 * не оформление, а способ подачи.
 */
export const NARROW_QUERY = '(max-width: 767px)';

export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches
  );

  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return narrow;
}
