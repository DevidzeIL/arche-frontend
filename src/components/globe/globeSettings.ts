/**
 * Что показывать на глобусе — одно место для всех настроек.
 *
 * Раньше были только пять галочек слоёв. Теперь можно оставить одни
 * сражения или одних философов, перекрасить карту по религии, сделать
 * фон гуще или реже. Всё запоминается в браузере: это личные удобства,
 * и терять их при перезагрузке незачем.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Coloring } from '@/arche/coloring';

export type Density = 'less' | 'normal' | 'more';

export interface GlobeLayers {
  states: boolean;
  capitals: boolean;
  background: boolean;
  events: boolean;
  people: boolean;
  /** Дуги влияния между местами хранилища */
  arcs: boolean;
  /** Подписи государств, столиц и фона; места хранилища подписаны всегда */
  labels: boolean;
}

export interface GlobeSettings {
  layers: GlobeLayers;
  /** Какие виды событий показывать; пусто — все */
  hiddenEventKinds: string[];
  /** Какие области людей скрыть */
  hiddenPeopleGroups: string[];
  density: Density;
  coloring: Coloring;
  /** Шаг стрелок и кнопок ‹ ›, лет */
  step: number;
  /** Скорость проигрывания истории */
  speed: number;
}

export const DEFAULT_SETTINGS: GlobeSettings = {
  layers: {
    states: true,
    capitals: true,
    background: true,
    events: true,
    people: true,
    arcs: true,
    labels: true,
  },
  hiddenEventKinds: [],
  hiddenPeopleGroups: [],
  density: 'normal',
  coloring: 'states',
  step: 1,
  speed: 1,
};

export const DENSITY_FACTOR: Record<Density, number> = { less: 0.5, normal: 1, more: 2.2 };

const KEY = 'arche-globe-settings';
/** Прежний ключ: только слои */
const LEGACY_KEY = 'arche-globe-layers';

function read(): GlobeSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<GlobeSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        layers: { ...DEFAULT_SETTINGS.layers, ...saved.layers },
      };
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      return { ...DEFAULT_SETTINGS, layers: { ...DEFAULT_SETTINGS.layers, ...JSON.parse(legacy) } };
    }
  } catch {
    // Хранилище недоступно или испорчено — начинаем с умолчаний
  }
  return DEFAULT_SETTINGS;
}

export function useGlobeSettings() {
  const [settings, setSettings] = useState<GlobeSettings>(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // Приватный режим — настройки просто не запомнятся
    }
  }, [settings]);

  const update = useCallback((patch: Partial<GlobeSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const setLayer = useCallback((key: keyof GlobeLayers, value: boolean) => {
    setSettings((current) => ({ ...current, layers: { ...current.layers, [key]: value } }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  return { settings, update, setLayer, reset };
}
