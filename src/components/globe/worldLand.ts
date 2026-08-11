/**
 * Очертания суши для глобуса.
 *
 * Берём самый грубый набор (110m, 55 КБ) и вшиваем в бандл, как и заметки:
 * бэкенда у приложения нет, а тянуть тайлы со стороннего сервера значило бы
 * завести зависимость от чужой доступности ради фона под точками.
 *
 * На шаре размером с экран телефона разница между 110m и 50m не видна,
 * а вес отличается вдесятеро.
 */
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { FeatureCollection, MultiPolygon } from 'geojson';
import topology from 'world-atlas/land-110m.json';

let cached: FeatureCollection<MultiPolygon> | null = null;

export function worldLand(): FeatureCollection<MultiPolygon> {
  if (!cached) {
    const world = topology as unknown as Topology;
    // В land-110m один объект `land` — это MultiPolygon всей суши
    cached = feature(world, world.objects.land) as unknown as FeatureCollection<MultiPolygon>;
    if (cached.type !== 'FeatureCollection') {
      cached = {
        type: 'FeatureCollection',
        features: [cached as unknown as FeatureCollection<MultiPolygon>['features'][number]],
      };
    }
  }
  return cached;
}
