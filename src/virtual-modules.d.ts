/**
 * Модули, которые собирают плагины Vite (см. vite/borders.ts).
 */
declare module 'virtual:arche-borders' {
  import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
  import type { NameOverrides, PatchProperties, Sovereignty } from '@/arche/bordersData';

  /** Заплатки из arche-vault/_borders/patches.geojson */
  export const patches: FeatureCollection<Polygon | MultiPolygon, PatchProperties>;
  /** Поправки названий из arche-vault/_borders/names.json */
  export const names: NameOverrides;
  /** id города → отрезки «чья это земля» */
  export const sovereignty: Sovereignty;
}
