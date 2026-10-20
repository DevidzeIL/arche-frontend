import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { geoContains, geoDistance } from 'd3-geo';
import { ChartGantt, Clock, Eye, EyeOff, Globe2, Map as MapIcon, Route, Search, Settings2, Swords, X } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { normalizeTitle } from '@/arche/normalize';
import { notesByPlace, placesForGraph } from '@/arche/geo';
import { RELATION_META } from '@/arche/relations';
import { formatYear } from '@/arche/timeSpan';
import { loadBordersIndex, polityOfPlace, stateName, useBordersAt } from '@/arche/borders';
import { polityKey, type BordersIndex } from '@/arche/bordersData';
import { categoryOf, COLORINGS, type Coloring } from '@/arche/coloring';
import { atlasHues } from '@/arche/atlasColors';
import { GlobeLegend } from './GlobeLegend';
import { useLeftPage } from './useLeftPage';
import {
  eventsAround,
  isAlive,
  loadContext,
  windowFor,
  withoutVaultDuplicates,
  type ContextData,
} from '@/arche/context';
import {
  capitalAt,
  loadPolityFacts,
  loadRulers,
  type PolityFacts,
  type Ruler,
} from '@/arche/polityFacts';
import { battlesOf, loadKb, loadKbLinks, typeLabel, yearsOf, type Kb, type KbLinks } from '@/arche/kb';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { plural } from '@/lib/plural';
import {
  GlobeCanvas,
  type BackgroundLayer,
  type CapitalPoint,
  type ContextPoint,
  type GlobeArc,
  type GlobeMarker,
  type GlobeMode,
  type CityPoint,
  type GlobeSelection,
  type LifeLine,
  type Spotlight,
  type StateLayer,
} from './GlobeCanvas';
import { cityExistsAt, cityNameAt, loadCities, renamedAt, UNDATED_FROM, type CitiesData } from '@/arche/cities';
import { useVaultLinks } from '@/arche/vaultLinks';
import { buildCourses } from '@/arche/learning/curriculum';
import { useProgressStore } from '@/arche/learning/progressStore';
import { chapterTour, kmBetween, movementPlaced, movementTour, warTour, type Tour } from '@/arche/tours';
import { GlobeTour, GlobeTourMenu, QUIZ_SIZE, type TourOption, type TourQuiz } from './GlobeTour';
import {
  CityPanel,
  ContextPanel,
  KbPanel,
  MeanwhilePanel,
  PlacePanel,
  PRESENT,
  StatePanel,
  type CityFacts,
  type LocatedNote,
} from './GlobePanels';
import { DENSITY_FACTOR, useGlobeSettings } from './globeSettings';
import { GlobeSettingsPanel } from './GlobeSettingsPanel';
import { GlobeTimeBar, type TimeBand } from './GlobeTimeBar';
import { GlobeSearch, type SearchEntry } from './GlobeSearch';
import { GlobeLanes, type LaneBar } from './GlobeLanes';

/** За сколько секунд «проигрывается» вся история при скорости ×1 */
const PLAY_SECONDS = 40;
/**
 * Сколько точек фона отдавать холсту. Рисует он не все: на общем виде —
 * полсотни самых известных, при приближении — больше
 */
const CONTEXT_EVENTS = 700;
const CONTEXT_PEOPLE = 1000;
/** «Рядом в хранилище» у события или человека: насколько далеко */
const NEARBY_KM = 700;
const EARTH_KM = 6371;
const HISTORY_LIMIT = 20;
const HINTS_KEY = 'arche-globe-hints-seen';

/** Расстояние по большому кругу, км */
const distanceKm = (a: [number, number], b: [number, number]) => geoDistance(a, b) * EARTH_KM;

/** Элемент Wikidata государства: по нему ищутся сведения о нём */
const qidOf = (shape: { polity?: { q?: string }; patch?: { wikidata?: string } }) =>
  shape.polity?.q ?? shape.patch?.wikidata;

const sameSelection = (a: GlobeSelection | null, b: GlobeSelection | null) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Выбор из адреса: ?place=…, ?state=…, ?item=…, ?kb=… */
function selectionFromParams(params: URLSearchParams): GlobeSelection | null {
  const place = params.get('place');
  if (place) return { kind: 'place', id: place };
  const state = params.get('state');
  if (state) return { kind: 'state', key: state };
  const item = params.get('item');
  if (item) return { kind: 'context', id: item };
  const city = params.get('city');
  if (city) return { kind: 'city', id: city };
  const kb = params.get('kb');
  return kb ? { kind: 'kb', id: kb } : null;
}

function seenHints(): boolean {
  try {
    return localStorage.getItem(HINTS_KEY) === '1';
  } catch {
    return true;
  }
}

export function GlobeView() {
  const notes = useArcheStore((s) => s.notes);
  const graph = useArcheStore((s) => s.knowledgeGraph);
  const [params] = useSearchParams();
  // Адрес читается один раз: дальше он только отражает состояние глобуса
  const initial = useRef(new URLSearchParams(params));
  const { settings, update, setLayer, reset } = useGlobeSettings();
  const layers = settings.layers;

  const geo = useMemo(() => {
    const { index, placesOf } = placesForGraph(notes, graph);

    const located: LocatedNote[] = [];
    for (const [noteId, places] of placesOf) {
      const node = graph.nodeById.get(noteId);
      // Без датировки заметку некуда поставить на шкале времени
      if (!node?.time || node.type === 'place') continue;
      located.push({
        noteId,
        title: node.title,
        type: node.type,
        year: node.time.displayYear,
        endYear: node.time.endYear,
        placeIds: places.map((p) => p.id),
      });
    }

    located.sort((a, b) => a.year - b.year);
    return { index, placesOf, byPlace: notesByPlace(placesOf), located };
  }, [notes, graph]);

  /**
   * Чьей землёй было место каждой заметки в её год: Кант → Королевство
   * Пруссия. По этому индексу клик по государству находит заметки
   * внутри его границ.
   */
  const notesByPolity = useMemo(() => {
    const map = new Map<string, LocatedNote[]>();
    const add = (key: string, item: LocatedNote) => {
      const list = map.get(key) ?? [];
      if (!list.includes(item)) list.push(item);
      map.set(key, list);
    };
    for (const item of geo.located) {
      for (const placeId of item.placeIds) {
        const segment = polityOfPlace(placeId, item.year);
        if (!segment?.k) continue;
        add(segment.k, item);
        if (segment.u) add(segment.u.k, item);
      }
    }
    return map;
  }, [geo.located]);

  const bounds = useMemo(() => {
    if (geo.located.length === 0) return { min: 0, max: PRESENT };
    return {
      min: Math.min(geo.located[0].year, -800),
      max: Math.max(PRESENT, geo.located[geo.located.length - 1].year),
    };
  }, [geo.located]);

  /** Эпохи хранилища — полосы на шкале времени */
  const bands = useMemo<TimeBand[]>(
    () =>
      graph.nodes
        .filter((n) => n.type === 'time' && n.time && n.time.endYear !== undefined)
        .map((n) => ({ id: n.id, title: n.title, from: n.time!.startYear, to: n.time!.endYear! }))
        .sort((a, b) => a.from - b.from),
    [graph.nodes]
  );
  const ticks = useMemo(() => [...new Set(geo.located.map((n) => n.year))], [geo.located]);

  const initialYear = Number(initial.current.get('year'));
  const [year, setYear] = useState(
    Number.isFinite(initialYear) && initial.current.has('year') ? initialYear : bounds.max
  );
  const [playing, setPlaying] = useState(false);
  const leftPage = useLeftPage();
  const [selection, setSelection] = useState<GlobeSelection | null>(() => selectionFromParams(initial.current));
  const [history, setHistory] = useState<GlobeSelection[]>([]);
  const [mode, setMode] = useState<GlobeMode>(initial.current.get('mode') === 'flat' ? 'flat' : 'globe');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [meanwhileOpen, setMeanwhileOpen] = useState(false);
  const [war, setWar] = useState<string | null>(initial.current.get('war'));
  const [hintsOpen, setHintsOpen] = useState(() => !seenHints());
  const [lanesOpen, setLanesOpen] = useState(false);
  /** Маршрут: глава курса, война по сражениям, течение по людям — см. tours.ts */
  const [tourId, setTourId] = useState<string | null>(() => initial.current.get('tour'));
  const [tourStep, setTourStep] = useState(() => Math.max(0, Number(initial.current.get('step')) || 0));
  const [toursOpen, setToursOpen] = useState(false);
  const [quiz, setQuiz] = useState<TourQuiz | null>(null);
  /**
   * Фокус: в режиме войны или маршрута на карте только то, что к ним
   * относится, — сражения, шаги, границы. Люди, события, дуги и свои места
   * прячутся, чтобы не было каши; одной кнопкой их можно вернуть
   */
  const [showRest, setShowRest] = useState(false);
  const lessonsRead = useProgressStore((s) => s.lessonsRead);
  const markLessonRead = useProgressStore((s) => s.markLessonRead);
  const notesById = useArcheStore((s) => s.notesById);
  const navigate = useNavigate();
  const [focus, setFocus] = useState<{ lon: number; lat: number; token: number; zoom?: number } | null>(null);
  /** Выбрали государство, которого ещё нет в загруженном веке — повернуться, когда появится */
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    const color = initial.current.get('color') as Coloring | null;
    if (color && COLORINGS.some((c) => c.key === color)) update({ coloring: color });
  }, [update]);

  // Пришли со страницы заметки: повернуться к месту
  useEffect(() => {
    const placeId = initial.current.get('place');
    const place = placeId ? geo.index.byId.get(placeId) : null;
    if (place) setFocus({ lon: place.geo.lon, lat: place.geo.lat, token: Date.now() });
  }, [geo.index.byId]);

  /*
   * Состояние — в адрес: таким видом можно поделиться ссылкой.
   *
   * Пишется мимо роутера, через history.replaceState. Через setSearchParams
   * каждая запись была навигацией: она отменяла уже начатый переход по ссылке
   * в шапке (страница ещё грузилась — и тут глобус «переходил» сам на себя),
   * а новая личность setSearchParams после каждой записи перезапускала этот
   * же эффект — и так по кругу каждые 350 мс. Адрес нужен только для ссылки
   * и для «назад» в браузере; роутеру знать о каждом годе незачем
   */
  const roundedYear = Math.round(year);
  useEffect(() => {
    if (playing) return;
    const timer = window.setTimeout(() => {
      // Уже ушли со страницы — адрес глобуса поверх чужой страницы не пишем
      if (leftPage()) return;
      const next = new URLSearchParams();
      next.set('year', String(roundedYear));
      if (mode === 'flat') next.set('mode', 'flat');
      if (settings.coloring !== 'states') next.set('color', settings.coloring);
      if (war) next.set('war', war);
      if (selection?.kind === 'place') next.set('place', selection.id);
      if (selection?.kind === 'state') next.set('state', selection.key);
      if (selection?.kind === 'context') next.set('item', selection.id);
      if (selection?.kind === 'kb') next.set('kb', selection.id);
      if (selection?.kind === 'city') next.set('city', selection.id);
      if (tourId) {
        next.set('tour', tourId);
        next.set('step', String(tourStep));
      }
      const url = `${window.location.pathname}?${next.toString()}`;
      if (url !== window.location.pathname + window.location.search) {
        // Состояние истории — роутера: без него «назад» потеряло бы свою запись
        window.history.replaceState(window.history.state, '', url);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [roundedYear, mode, settings.coloring, war, selection, playing, tourId, tourStep, leftPage]);

  // Проигрывание истории: год ползёт от начала к концу
  useEffect(() => {
    if (!playing) return;
    const span = bounds.max - bounds.min;
    if (span <= 0) return;

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      // Ушли со страницы — не перебиваем переход на неё обновлением года
      if (leftPage()) return;
      const delta = (now - last) / 1000;
      last = now;
      setYear((current) => {
        const next = current + (span * delta * settings.speed) / PLAY_SECONDS;
        if (next >= bounds.max) {
          setPlaying(false);
          return bounds.max;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, bounds.min, bounds.max, settings.speed, leftPage]);

  const togglePlay = useCallback(() => {
    setPlaying((current) => {
      if (current) return false;
      // С конца шкалы — с начала, иначе — откуда стоим
      setYear((y) => (Math.round(y) >= bounds.max ? bounds.min : y));
      return true;
    });
  }, [bounds.min, bounds.max]);

  const changeYear = useCallback(
    (next: number) => {
      setPlaying(false);
      setYear(Math.max(bounds.min, Math.min(bounds.max, next)));
    },
    [bounds.min, bounds.max]
  );

  const borders = useBordersAt(year, { states: layers.states, background: layers.background });

  const [index, setIndex] = useState<BordersIndex | null>(null);
  useEffect(() => {
    loadBordersIndex().then(setIndex);
  }, []);

  // Сведения о государствах: столицы и раскраска нужны карте сразу, правители — только панели
  const [facts, setFacts] = useState<Record<string, PolityFacts> | null>(null);
  useEffect(() => {
    if (!layers.states) return;
    let alive = true;
    loadPolityFacts().then((loaded) => alive && setFacts(loaded));
    return () => {
      alive = false;
    };
  }, [layers.states]);

  const [rulers, setRulers] = useState<Record<string, Ruler[]> | null>(null);
  useEffect(() => {
    if ((selection?.kind !== 'state' && !lanesOpen) || rulers) return;
    let alive = true;
    loadRulers().then((loaded) => alive && setRulers(loaded));
    return () => {
      alive = false;
    };
  }, [selection, rulers, lanesOpen]);

  const [context, setContext] = useState<ContextData | null>(null);
  useEffect(() => {
    const tourNeeds = tourId?.startsWith('movement:') || toursOpen;
    if (!layers.events && !layers.people && !meanwhileOpen && selection?.kind !== 'context' && selection?.kind !== 'city' && !tourNeeds) return;
    let alive = true;
    loadContext().then((data) => {
      if (!alive || !data) return;
      const titles = new Set(notes.map((note) => normalizeTitle(note.title)));
      setContext(withoutVaultDuplicates(data, titles));
    });
    return () => {
      alive = false;
    };
  }, [layers.events, layers.people, meanwhileOpen, selection, notes, tourId, toursOpen]);

  // Города-ориентиры: слой включён или город выбран по ссылке
  const [cities, setCities] = useState<CitiesData | null>(null);
  const needCities = layers.cities || selection?.kind === 'city';
  useEffect(() => {
    if (!needCities) return;
    let alive = true;
    loadCities().then((data) => alive && setCities(data));
    return () => {
      alive = false;
    };
  }, [needCities]);

  // База знаний: для поиска, войн и справок — грузится, когда понадобилась
  const [kb, setKb] = useState<Kb | null>(null);
  /** База не собрана (pnpm kb) — сказать об этом, а не «загружаю» вечно */
  const [kbMissing, setKbMissing] = useState(false);
  const [kbLinks, setKbLinks] = useState<KbLinks | null>(null);
  const [wantKb, setWantKb] = useState(
    Boolean(initial.current.get('war') || initial.current.get('kb') || /^(war|movement):/.test(initial.current.get('tour') ?? ''))
  );
  useEffect(() => {
    if (!wantKb && selection?.kind !== 'kb' && !war && !lanesOpen) return;
    let alive = true;
    loadKb().then((loaded) => {
      if (!alive) return;
      setKb(loaded);
      setKbMissing(loaded === null);
    });
    loadKbLinks().then((loaded) => alive && setKbLinks(loaded));
    return () => {
      alive = false;
    };
  }, [wantKb, selection, war, lanesOpen]);

  /** Что уже случилось к выбранному году */
  const visible = useMemo(
    () => geo.located.filter((item) => item.year <= year),
    [geo.located, year]
  );

  // Своё место называется так, как город звался в этот год: «Санкт-Петербург» в 1939-м — Ленинград
  const vault = useVaultLinks();
  const markers = useMemo<GlobeMarker[]>(() => {
    const counts = new Map<string, number>();
    for (const item of visible) {
      for (const placeId of item.placeIds) {
        counts.set(placeId, (counts.get(placeId) ?? 0) + 1);
      }
    }

    const max = Math.max(1, ...counts.values());
    return geo.index.places
      .map((place) => {
        const count = counts.get(place.id) ?? 0;
        const qid = vault.qidOf(place.id);
        const label = qid && cities ? (renamedAt(cities, qid, roundedYear) ?? undefined) : undefined;
        return { place, count, weight: count / max, label };
      })
      // Пустое место на глобусе — просто шум: пока там ничего не произошло,
      // показывать нечего
      .filter((marker) => marker.count > 0);
  }, [geo.index.places, visible, vault, cities, roundedYear]);

  const selectedPlaceId = selection?.kind === 'place' ? selection.id : null;

  const arcs = useMemo<GlobeArc[]>(() => {
    if (!layers.arcs) return [];
    const shown = new Set(visible.map((item) => item.noteId));
    const placeOfNote = new Map<string, string>();
    for (const item of visible) placeOfNote.set(item.noteId, item.placeIds[0]);

    const byPair = new Map<string, GlobeArc>();

    for (const edge of graph.edges) {
      if (!RELATION_META[edge.kind].genealogical || edge.undirected) continue;
      if (!shown.has(edge.sourceId) || !shown.has(edge.targetId)) continue;

      const fromId = placeOfNote.get(edge.sourceId);
      const toId = placeOfNote.get(edge.targetId);
      if (!fromId || !toId || fromId === toId) continue;

      const key = `${fromId}|${toId}`;
      if (byPair.has(key)) continue;

      const from = geo.index.byId.get(fromId);
      const to = geo.index.byId.get(toId);
      if (!from || !to) continue;

      byPair.set(key, {
        fromId,
        toId,
        from: [from.geo.lon, from.geo.lat],
        to: [to.geo.lon, to.geo.lat],
        color: RELATION_META[edge.kind].color,
      });
    }

    const all = [...byPair.values()];
    // При выбранном месте показываем только его связи: иначе Европа
    // затягивается сеткой, из которой ничего не прочитать
    return selectedPlaceId
      ? all.filter((arc) => arc.fromId === selectedPlaceId || arc.toId === selectedPlaceId)
      : all;
  }, [graph.edges, visible, geo.index.byId, selectedPlaceId, layers.arcs]);

  const warItem = war && kb ? kb.items[war] : null;
  const warParticipants = useMemo(() => new Set(warItem?.p ?? []), [warItem]);

  /** Цвета атласа на этот год: соседи различимы, у каждого государства свой цвет */
  const atlas = useMemo(() => atlasHues(borders.states), [borders.states]);

  const stateLayers = useMemo<StateLayer[]>(
    () =>
      borders.states.map((shape) => {
        const qid = qidOf(shape);
        const polityFacts = facts && qid ? facts[qid] : undefined;
        const category = settings.coloring === 'states' ? null : categoryOf(settings.coloring, polityFacts, roundedYear);
        return {
          ...shape,
          ru: stateName(shape, roundedYear),
          capital: polityFacts ? capitalAt(polityFacts, roundedYear)?.name : undefined,
          hue: category?.hue ?? atlas.get(shape.key) ?? shape.hue,
          nodata: settings.coloring !== 'states' && !category,
          category: category?.label,
          muted: category?.muted,
          emphasis: warItem ? (qid && warParticipants.has(qid) ? 'on' : 'off') : undefined,
        };
      }),
    [borders.states, roundedYear, facts, settings.coloring, warItem, warParticipants, atlas]
  );

  /** Легенда раскраски: самые «просторные» категории на карте сейчас */
  const legend = useMemo(() => {
    if (settings.coloring === 'states') return [];
    const totals = new Map<string, { label: string; hue: number; size: number; muted?: boolean }>();
    for (const shape of stateLayers) {
      if (shape.union || shape.nodata || !shape.category) continue;
      const entry = totals.get(shape.category) ?? { label: shape.category, hue: shape.hue, size: 0, muted: shape.muted };
      entry.size += shape.size;
      totals.set(shape.category, entry);
    }
    // «По-разному» — в конец, рядом с «нет сведений»: это не ответ, а его отсутствие
    const all = [...totals.values()].sort((a, b) => b.size - a.size);
    const muted = all.filter((c) => c.muted);
    return [...all.filter((c) => !c.muted).slice(0, 10 - muted.length), ...muted];
  }, [stateLayers, settings.coloring]);

  const backgroundLayers = useMemo<BackgroundLayer[]>(() => borders.background, [borders.background]);

  /** Города, у которых были другие имена: по ним столица получает название своего года */
  const renamedCities = useMemo(() => (cities ? cities.cities.filter((c) => cities.renames[c.id]) : []), [cities]);

  const capitals = useMemo<CapitalPoint[]>(() => {
    if (!facts || !layers.capitals || !layers.states) return [];
    const seen = new Set<string>();
    const out: CapitalPoint[] = [];
    // Крупные государства первыми: их столицам приоритет на подпись
    for (const shape of borders.states.filter((s) => !s.union).sort((a, b) => b.size - a.size)) {
      const qid = qidOf(shape);
      const capital = qid ? capitalAt(facts[qid], roundedYear) : null;
      if (!capital) continue;
      const id = `${capital.name}|${capital.lon}|${capital.lat}`;
      if (seen.has(id)) continue;
      seen.add(id);
      // В Wikidata столица подписана нынешним именем: Данциг 1939 года — «Гданьск»
      const renamed = renamedCities.find((c) => Math.abs(c.lon - capital.lon) < 0.15 && Math.abs(c.lat - capital.lat) < 0.1);
      out.push({
        key: shape.key,
        name: renamed && cities ? cityNameAt(cities, renamed, roundedYear) : capital.name,
        state: stateName(shape, roundedYear),
        lon: capital.lon,
        lat: capital.lat,
      });
    }
    return out;
  }, [facts, borders.states, roundedYear, layers.capitals, layers.states, renamedCities, cities]);

  /**
   * Города на этот год, с названием этого года. Город под своим местом
   * хранилища или под столицей не рисуется: там уже стоит своя точка
   */
  const cityPoints = useMemo<CityPoint[]>(() => {
    if (!cities || !layers.cities) return [];
    const taken: Array<[number, number]> = [
      ...markers.filter((m) => m.place.geo.scale !== 'region').map((m): [number, number] => [m.place.geo.lon, m.place.geo.lat]),
      ...capitals.map((c): [number, number] => [c.lon, c.lat]),
    ];
    const occupied = (lon: number, lat: number) =>
      taken.some(([x, y]) => Math.abs(x - lon) < 0.12 && Math.abs(y - lat) < 0.08);
    const out: CityPoint[] = [];
    for (const city of cities.cities) {
      if (!cityExistsAt(city, roundedYear) || occupied(city.lon, city.lat)) continue;
      const name = cityNameAt(cities, city, roundedYear);
      const parts = ['город'];
      if (city.from !== null && !city.approx) parts.push(`основан ${formatYear(city.from)}`);
      if (name !== city.name) parts.push(`сейчас ${city.name}`);
      out.push({ id: city.id, name, lon: city.lon, lat: city.lat, rank: out.length, sub: parts.join(' · ') });
    }
    return out;
  }, [cities, layers.cities, roundedYear, markers, capitals]);

  const contextNow = useMemo(() => {
    if (!context) return { events: [], people: [] };
    return {
      events: eventsAround(context, roundedYear, CONTEXT_EVENTS),
      people: context.people.filter((p) => isAlive(p, roundedYear)).slice(0, CONTEXT_PEOPLE),
    };
  }, [context, roundedYear]);

  /** Виды событий и области людей — с числом тех, что видны сейчас */
  const eventKinds = useMemo(() => {
    if (!context) return [];
    const counts = new Map<string, number>();
    for (const e of contextNow.events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    return Object.entries(context.kinds).map(([key, label]) => ({ key, label, count: counts.get(key) ?? 0 }));
  }, [context, contextNow.events]);
  const peopleGroups = useMemo(() => {
    if (!context) return [];
    const counts = new Map<string, number>();
    for (const p of contextNow.people) counts.set(p.group, (counts.get(p.group) ?? 0) + 1);
    return Object.entries(context.groups).map(([key, label]) => ({ key, label, count: counts.get(key) ?? 0 }));
  }, [context, contextNow.people]);

  const contextPoints = useMemo<ContextPoint[]>(() => {
    const points: ContextPoint[] = [];
    // Сражения выбранной войны — первыми и всегда
    if (war && warItem && kb) {
      for (const id of battlesOf(kb, war)) {
        const battle = kb.items[id];
        if (!battle?.c) continue;
        points.push({
          id,
          kind: 'battle',
          lon: battle.c[0],
          lat: battle.c[1],
          title: battle.n,
          sub: `Сражение${battle.f !== undefined ? ` · ${formatYear(battle.f)}` : ''}`,
        });
      }
    }
    if (!context) return points;
    if (layers.events) {
      for (const e of contextNow.events) {
        if (settings.hiddenEventKinds.includes(e.kind)) continue;
        points.push({
          id: e.id,
          kind: 'event',
          lon: e.lon,
          lat: e.lat,
          title: e.title,
          sub: `${context.kinds[e.kind] ?? 'Событие'} · ${formatYear(e.year)}${e.end ? `–${formatYear(e.end)}` : ''}`,
        });
      }
    }
    if (layers.people) {
      for (const p of contextNow.people) {
        if (settings.hiddenPeopleGroups.includes(p.group)) continue;
        points.push({
          id: p.id,
          kind: 'person',
          lon: p.lon,
          lat: p.lat,
          title: p.title,
          sub: [p.description, p.place ? `родом из: ${p.place}` : null].filter(Boolean).join(' · '),
        });
      }
    }
    return points;
  }, [context, contextNow, layers.events, layers.people, settings.hiddenEventKinds, settings.hiddenPeopleGroups, warItem, kb]);

  const selectedPlace = selectedPlaceId ? geo.index.byId.get(selectedPlaceId) : null;
  const selectedNotes = useMemo(() => {
    if (!selectedPlaceId) return [];
    return visible
      .filter((item) => item.placeIds.includes(selectedPlaceId))
      .sort((a, b) => a.year - b.year);
  }, [visible, selectedPlaceId]);

  const selectedState = useMemo(() => {
    if (selection?.kind !== 'state') return null;
    return borders.states.find((shape) => shape.key === selection.key && !shape.union) ?? null;
  }, [selection, borders.states]);

  // Государство из поиска появилось в загруженном веке — поворачиваемся к нему
  useEffect(() => {
    if (!selectedState || pendingFocus.current !== selectedState.key) return;
    pendingFocus.current = null;
    setFocus({ lon: selectedState.label[0], lat: selectedState.label[1], token: Date.now() });
  }, [selectedState]);

  const selectedContext = useMemo(() => {
    if (selection?.kind !== 'context' || !context) return null;
    return (
      context.events.find((e) => e.id === selection.id) ??
      context.people.find((p) => p.id === selection.id) ??
      null
    );
  }, [selection, context]);

  const selectedCity = selection?.kind === 'city' && cities ? (cities.byId.get(selection.id) ?? null) : null;

  const courses = useMemo(() => buildCourses(notes), [notes]);
  const tour = useMemo<Tour | null>(() => {
    if (!tourId) return null;
    const [kind, ...rest] = tourId.split(':');
    const id = rest.join(':');
    if (kind === 'chapter') {
      for (const course of courses) {
        const chapter = course.chapters.find((ch) => ch.id === id);
        if (chapter) return chapterTour({ course, chapter, graph, notesById, placesOf: geo.placesOf });
      }
      return null;
    }
    if (kind === 'war' && kb) return warTour(kb, id);
    if (kind === 'movement' && kb && kbLinks && context) return movementTour(kb, kbLinks, context, id);
    return null;
  }, [tourId, courses, graph, notesById, geo.placesOf, kb, kbLinks, context]);
  const tourIndex = tour ? Math.min(tourStep, tour.steps.length - 1) : 0;
  const step = tour ? tour.steps[tourIndex] : null;

  /** Подсветка маршрута: текущий шаг, а в самопроверке — правильный ответ после щелчка */
  const tourSpot = useMemo<Spotlight | null>(() => {
    if (!tour) return null;
    if (quiz) {
      if (!quiz.revealed || quiz.index >= quiz.steps.length) return null;
      const asked = tour.steps[quiz.steps[quiz.index]];
      return asked.at ? { lon: asked.at[0], lat: asked.at[1], label: asked.title } : null;
    }
    return step?.at ? { lon: step.at[0], lat: step.at[1], label: step.title } : null;
  }, [tour, quiz, step]);

  /** Чей город в этот год, кто здесь родился и умер, что здесь было */
  const cityFacts = useMemo<CityFacts | null>(() => {
    if (!selectedCity || !cities) return null;
    const at: [number, number] = [selectedCity.lon, selectedCity.lat];
    const near = (lon: number, lat: number, km: number) => distanceKm(at, [lon, lat]) <= km;
    const top = <T extends { links: number }>(list: T[]) => [...list].sort((a, b) => b.links - a.links).slice(0, 12);
    const names = new Set([selectedCity.name, ...(cities.renames[selectedCity.id] ?? []).map((r) => r[2])]);
    const born = context ? top(context.people.filter((p) => near(p.lon, p.lat, 12))).sort((a, b) => a.birth - b.birth) : [];
    const died = context
      ? top(context.people.filter((p) => p.deathPlace !== null && names.has(p.deathPlace))).sort(
          (a, b) => (a.death ?? 0) - (b.death ?? 0)
        )
      : [];
    const events = context ? top(context.events.filter((e) => near(e.lon, e.lat, 20))).sort((a, b) => a.year - b.year) : [];
    const nearby = geo.located
      .filter((item) =>
        item.placeIds.some((id) => {
          const place = geo.index.byId.get(id);
          return place !== undefined && place.geo.scale !== 'region' && near(place.geo.lon, place.geo.lat, 25);
        })
      )
      .slice(0, 8);
    // Границы упрощены, и город на берегу (Константинополь на Босфоре) часто
    // оказывается в воде. Поэтому проверяется не только точка, но и кольцо
    // в ~15 км вокруг: сама точка весит втрое больше любой из соседних
    const probes: Array<[[number, number], number]> = [
      [at, 3],
      ...Array.from({ length: 8 }, (_, i): [[number, number], number] => {
        const angle = (i * Math.PI) / 4;
        return [[at[0] + 0.2 * Math.cos(angle), at[1] + 0.14 * Math.sin(angle)], 1];
      }),
    ];
    type Shape = (typeof borders.states)[number];
    let state: Shape | null = null;
    let union: Shape | null = null;
    let stateScore = 0;
    let unionScore = 0;
    for (const shape of borders.states) {
      const [w, s, e, n] = shape.bbox;
      if (at[0] < w - 0.3 || at[0] > e + 0.3 || at[1] < s - 0.3 || at[1] > n + 0.3) continue;
      const score = probes.reduce((sum, [point, weight]) => sum + (geoContains(shape.area, point) ? weight : 0), 0);
      if (score === 0) continue;
      if (shape.union) {
        if (score > unionScore || (score === unionScore && union && shape.size < union.size)) [union, unionScore] = [shape, score];
      } else if (score > stateScore || (score === stateScore && state && shape.size < state.size)) {
        [state, stateScore] = [shape, score];
      }
    }
    return {
      state: state ? { key: state.key, name: stateName(state, roundedYear) } : null,
      union: union ? stateName(union, roundedYear) : null,
      born,
      died,
      events,
      nearby,
    };
  }, [selectedCity, cities, context, geo.located, geo.index.byId, borders.states, roundedYear]);

  /** Где выбранное на карте: человек, событие, сражение, место — подсвечивается поверх всего */
  const spotlight = useMemo<Spotlight | null>(() => {
    // В самопроверке выбранное не подсвечиваем: подсветка была бы подсказкой
    if (quiz) return tourSpot;
    if (selectedContext) return { lon: selectedContext.lon, lat: selectedContext.lat, label: selectedContext.title };
    if (selectedCity && cities) {
      return { lon: selectedCity.lon, lat: selectedCity.lat, label: cityNameAt(cities, selectedCity, roundedYear) };
    }
    if (selection?.kind === 'kb' && kb) {
      const item = kb.items[selection.id];
      if (item?.c) return { lon: item.c[0], lat: item.c[1], label: item.n };
    }
    if (selection?.kind === 'place') {
      const place = geo.index.byId.get(selection.id);
      if (place) return { lon: place.geo.lon, lat: place.geo.lat, label: place.title };
    }
    return tourSpot;
  }, [selectedContext, selectedCity, cities, roundedYear, selection, kb, geo.index.byId, quiz, tourSpot]);

  /** Линия жизни: родился здесь, умер там. Если это один город — линии нет */
  const lifeLine = useMemo<LifeLine | null>(() => {
    if (!selectedContext || !('birth' in selectedContext) || quiz) return null;
    const { dlon, dlat } = selectedContext;
    if (dlon === null || dlat === null) return null;
    const from: [number, number] = [selectedContext.lon, selectedContext.lat];
    const to: [number, number] = [dlon, dlat];
    if (distanceKm(from, to) < 25) return null;
    const where = selectedContext.deathPlace ?? 'место смерти';
    return { from, to, label: `† ${where}${selectedContext.death ? `, ${formatYear(selectedContext.death)}` : ''}` };
  }, [selectedContext, quiz]);

  /** Заметки хранилища рядом с событием или человеком — по времени и месту */
  const nearbyNotes = useMemo<LocatedNote[]>(() => {
    if (!selectedContext) return [];
    const at: [number, number] = [selectedContext.lon, selectedContext.lat];
    const isPerson = 'birth' in selectedContext;
    const from = isPerson ? selectedContext.birth : selectedContext.year;
    const to = isPerson
      ? selectedContext.death ?? selectedContext.birth + 70
      : selectedContext.end ?? selectedContext.year;
    // У человека — настоящее пересечение лет: Гоббс, умерший за пятнадцать лет
    // до рождения Вольтера, ему не сосед. У события — с запасом «в это время»
    const span = isPerson ? 0 : windowFor(from);
    return geo.located
      .filter((item) => item.year - span <= to && (item.endYear ?? item.year) + span >= from)
      .filter((item) =>
        item.placeIds.some((id) => {
          const place = geo.index.byId.get(id);
          return place !== undefined && distanceKm(at, [place.geo.lon, place.geo.lat]) <= NEARBY_KM;
        })
      )
      .slice(0, 8);
  }, [selectedContext, geo.located, geo.index.byId]);

  /** Высота карточки маршрута и шкалы на телефоне — центр шара поднимается над ними */
  const bottomRef = useRef<HTMLDivElement>(null);
  const [bottomInset, setBottomInset] = useState(0);
  useEffect(() => {
    const el = bottomRef.current;
    if (!el || !tour) {
      setBottomInset(0);
      return;
    }
    const narrow = window.matchMedia('(max-width: 639px)');
    const update = () => setBottomInset(narrow.matches ? el.offsetHeight : 0);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, [tour]);

  useEffect(() => setShowRest(false), [war, tourId]);
  const focused = Boolean((war || tour) && !showRest);
  /** Что маршрут выделяет на карте: места его шагов и точки фона */
  const tourTargets = useMemo(
    () => new Set((tour?.steps ?? []).flatMap((s) => (s.selection ? [s.selection.id] : []))),
    [tour]
  );
  const shownMarkers = useMemo(
    () => (!focused ? markers : war ? [] : markers.filter((m) => tourTargets.has(m.place.id))),
    [focused, war, markers, tourTargets]
  );
  const shownContext = useMemo(
    () =>
      !focused
        ? contextPoints
        : contextPoints.filter((p) => (war ? p.kind === 'battle' : tourTargets.has(p.id))),
    [focused, war, contextPoints, tourTargets]
  );

  /** Шаг маршрута двигает год и поворачивает шар — один раз на шаг */
  const appliedStep = useRef<string | null>(null);
  useEffect(() => {
    if (!tour || !step || quiz) return;
    const key = `${tour.id}#${step.key}`;
    if (appliedStep.current === key) return;
    appliedStep.current = key;
    setPlaying(false);
    if (step.year !== null) setYear(Math.max(bounds.min, Math.min(bounds.max, step.year)));
    if (step.at) setFocus({ lon: step.at[0], lat: step.at[1], token: Date.now() });
  }, [tour, step, quiz, bounds.min, bounds.max]);

  const startTour = useCallback((id: string) => {
    if (/^(war|movement):/.test(id)) setWantKb(true);
    setWar(id.startsWith('war:') ? id.slice(4) : null);
    appliedStep.current = null;
    setTourId(id);
    setTourStep(0);
    setQuiz(null);
    setToursOpen(false);
    setSelection(null);
    setHistory([]);
  }, []);

  const closeTour = useCallback(() => {
    if (tourId?.startsWith('war:')) setWar(null);
    setTourId(null);
    setTourStep(0);
    setQuiz(null);
    appliedStep.current = null;
  }, [tourId]);

  const goStep = useCallback(
    (index: number) => {
      if (!tour) return;
      setTourStep(Math.max(0, Math.min(tour.steps.length - 1, index)));
      setSelection(null);
    },
    [tour]
  );

  /**
   * Перед вопросом — отъехать: шар, приближенный к прошлому ответу,
   * подсказывал бы следующий. Центр — середина всех мест вопросов
   */
  const overview = useCallback(
    (indices: number[]) => {
      if (!tour) return;
      const points = indices.map((i) => tour.steps[i].at).filter((at): at is [number, number] => at !== null);
      if (points.length === 0) return;
      const lon = points.reduce((sum, p) => sum + p[0], 0) / points.length;
      const lat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
      setFocus({ lon, lat, token: Date.now(), zoom: 1.1 });
    },
    [tour]
  );

  /** «Где это?»: до пяти шагов с местом, в порядке маршрута */
  const startQuiz = useCallback(() => {
    if (!tour) return;
    // Спрашиваем только о шагах со своим местом: «где было мифологическое мышление» — не вопрос
    const placed = tour.steps.map((s, i) => (s.at && !s.via ? i : -1)).filter((i) => i >= 0);
    const picked = [...placed].sort(() => Math.random() - 0.5).slice(0, QUIZ_SIZE).sort((a, b) => a - b);
    setSelection(null);
    setQuiz({ steps: picked, index: 0, answers: [], revealed: false });
    const first = tour.steps[picked[0]];
    if (first?.year !== null && first?.year !== undefined) setYear(first.year);
    overview(picked);
  }, [tour, overview]);

  const answerQuiz = useCallback(
    (lonLat: [number, number]) => {
      if (!tour || !quiz || quiz.revealed || quiz.index >= quiz.steps.length) return;
      const target = tour.steps[quiz.steps[quiz.index]].at!;
      setQuiz({ ...quiz, answers: [...quiz.answers, kmBetween(lonLat, target)], revealed: true });
      setFocus({ lon: target[0], lat: target[1], token: Date.now() });
    },
    [tour, quiz]
  );

  const nextQuestion = useCallback(() => {
    if (!tour || !quiz) return;
    const index = quiz.index + 1;
    setQuiz({ ...quiz, index, revealed: false });
    const asked = tour.steps[quiz.steps[index]];
    if (asked?.year !== null && asked?.year !== undefined) setYear(asked.year);
    if (asked) overview(quiz.steps);
  }, [tour, quiz, overview]);

  /** Что предложить в списке маршрутов */
  const tourGroups = useMemo(() => {
    const chapters: TourOption[] = courses.flatMap((course) =>
      course.chapters.map((chapter) => ({
        id: `chapter:${chapter.id}`,
        title: chapter.ordinal ? `${chapter.ordinal}: ${chapter.title}` : chapter.title,
        sub: `${chapter.lessons.length} ${plural(chapter.lessons.length, 'урок', 'урока', 'уроков')} · ${course.title}`,
      }))
    );
    const wars: TourOption[] = kb
      ? Object.entries(kb.items)
          .filter(([, item]) => item.t === 'war')
          .map(([id, item]) => ({ id, item, count: battlesOf(kb, id).filter((b) => kb.items[b]?.c && kb.items[b]?.f !== undefined).length }))
          .filter((w) => w.count >= 4)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
          .map(({ id, item, count }) => ({
            id: `war:${id}`,
            title: item.n,
            sub: `${yearsOf(item, formatYear)} · ${count} ${plural(count, 'сражение', 'сражения', 'сражений')}`,
          }))
      : [];
    // Считаются только те, кого можно поставить на карту: у кого известно место рождения
    const movements: TourOption[] =
      kb && kbLinks && context
        ? Object.keys(kbLinks.members)
            .filter((id) => kb.items[id])
            .map((id) => ({ id, count: movementPlaced(kbLinks, context, id) }))
            .filter((m) => m.count >= 5)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
            .map(({ id, count }) => ({
              id: `movement:${id}`,
              title: kb.items[id].n,
              sub: `${yearsOf(kb.items[id], formatYear)} · ${count} ${plural(count, 'человек', 'человека', 'человек')}`,
            }))
        : [];
    return [
      { title: 'Главы курса', items: chapters },
      { title: 'Войны по сражениям', items: wars },
      { title: 'Течения в людях', items: movements },
    ];
  }, [courses, kb, kbLinks, context]);

  /** Выбрать — с запоминанием, откуда пришли: панель умеет «назад» */
  const select = useCallback(
    (next: GlobeSelection | null) => {
      setSelection((current) => {
        if (next && current && !sameSelection(current, next)) {
          setHistory((h) => [...h, current].slice(-HISTORY_LIMIT));
        }
        if (!next) setHistory([]);
        return next;
      });
      if (next) setMeanwhileOpen(false);
    },
    []
  );

  const back = useCallback(() => {
    setHistory((h) => {
      const previous = h[h.length - 1];
      if (previous) setSelection(previous);
      return h.slice(0, -1);
    });
  }, []);

  const close = useCallback(() => {
    setSelection(null);
    setHistory([]);
  }, []);

  /**
   * Выбрали из списка, а не на карте — повернуться к выбранному: событие
   * из «а в это время» иначе пришлось бы искать по всему шару
   */
  const selectAndFocus = useCallback(
    (next: GlobeSelection) => {
      select(next);
      let at: [number, number] | null = null;
      if (next.kind === 'context' && context) {
        const item = context.events.find((e) => e.id === next.id) ?? context.people.find((p) => p.id === next.id);
        if (item) at = [item.lon, item.lat];
      } else if (next.kind === 'state') {
        const shape = borders.states.find((s) => s.key === next.key && !s.union);
        if (shape) at = shape.label;
        else pendingFocus.current = next.key;
      } else if (next.kind === 'place') {
        const place = geo.index.byId.get(next.id);
        if (place) at = [place.geo.lon, place.geo.lat];
      } else if (next.kind === 'kb' && kb?.items[next.id]?.c) {
        at = kb.items[next.id].c!;
      } else if (next.kind === 'city' && cities) {
        const city = cities.byId.get(next.id);
        if (city) at = [city.lon, city.lat];
      }
      if (at) setFocus({ lon: at[0], lat: at[1], token: Date.now() });
    },
    [select, context, borders.states, geo.index.byId, kb, cities]
  );

  /**
   * Переход к предшественнику или преемнику: год сдвигается туда, где тот
   * ещё (или уже) существует, и он выбирается. Так от Пруссии можно дойти
   * до Германской империи, не ища её на карте.
   */
  const jumpTo = useCallback(
    (qid: string, direction: 'prev' | 'next') => {
      if (!index) return;
      const entry =
        index.polities.find((p) => p.q === qid && !p.u) ?? index.polities.find((p) => p.q === qid);
      if (!entry) return;
      changeYear(direction === 'prev' ? entry.t : entry.f);
      selectAndFocus({ kind: 'state', key: polityKey(entry) });
    },
    [index, changeYear, selectAndFocus]
  );

  /** Показать войну: участники подсвечены, сражения на карте, год — её начало */
  const showWar = useCallback(
    (id: string) => {
      setWantKb(true);
      setWar(id);
      const item = kb?.items[id];
      if (item?.f !== undefined) changeYear(item.f);
      const first = (kb ? battlesOf(kb, id) : []).map((b) => kb?.items[b]?.c).find(Boolean) ?? item?.c;
      if (first) setFocus({ lon: first[0], lat: first[1], token: Date.now() });
    },
    [kb, changeYear]
  );

  // Война из адреса — год и поворот, когда база загрузилась
  const warFocused = useRef(false);
  useEffect(() => {
    if (!war || !kb || warFocused.current) return;
    warFocused.current = true;
    const item = kb.items[war];
    const first = battlesOf(kb, war).map((b) => kb.items[b]?.c).find(Boolean) ?? item?.c;
    if (first) setFocus({ lon: first[0], lat: first[1], token: Date.now() });
  }, [war, kb]);

  // Поиск: всё, что можно найти на глобусе
  const searchEntries = useMemo<SearchEntry[]>(() => {
    const entries: SearchEntry[] = [];
    for (const place of geo.index.places) {
      entries.push({
        key: `place:${place.id}`,
        title: place.title,
        kind: 'place',
        sub: place.geo.scale === 'region' ? 'Регион хранилища' : 'Город хранилища',
        weight: 1,
      });
    }
    for (const note of geo.located) {
      entries.push({ key: `note:${note.noteId}`, title: note.title, kind: 'note', year: note.year, sub: 'Заметка' });
    }
    if (index) {
      const seen = new Set<string>();
      for (const p of index.polities) {
        const title = p.ru ?? p.n;
        if (p.u || seen.has(title)) continue;
        seen.add(title);
        entries.push({
          key: `state:${polityKey(p)}`,
          title,
          kind: 'state',
          sub: `Государство · ${formatYear(p.f)}–${p.t >= PRESENT ? 'наши дни' : formatYear(p.t)}`,
        });
      }
    }
    if (context) {
      for (const e of context.events) {
        entries.push({ key: `event:${e.id}`, title: e.title, kind: 'event', year: e.year, sub: context.kinds[e.kind] });
      }
      for (const p of context.people) {
        entries.push({ key: `person:${p.id}`, title: p.title, kind: 'person', year: p.birth, sub: context.groups[p.group] });
      }
    }
    if (cities) {
      for (const city of cities.cities) {
        entries.push({ key: `city:${city.id}`, title: city.name, kind: 'city', year: city.approx ? undefined : (city.from ?? undefined) });
        // Прежние названия ищутся тоже: «Константинополь» найдёт Стамбул в нужном веке
        for (const [from, to, name] of cities.renames[city.id] ?? []) {
          const at = from ?? (to !== null ? to - 1 : null);
          entries.push({ key: `city:${city.id}@${at ?? ''}`, title: name, kind: 'city', sub: `Город · сейчас ${city.name}`, year: at ?? undefined });
        }
      }
    }
    if (kb) {
      for (const [id, item] of Object.entries(kb.items)) {
        if (item.t === 'battle') continue;
        entries.push({
          key: `kb:${id}`,
          title: item.n,
          kind: 'kb',
          year: item.f,
          sub: [typeLabel(kb, item), yearsOf(item, formatYear)].filter(Boolean).join(' · '),
        });
      }
    }
    return entries;
  }, [geo.index.places, geo.located, index, context, kb, cities]);

  const pickSearch = useCallback(
    (entry: SearchEntry) => {
      const [kind, ...rest] = entry.key.split(':');
      const id = rest.join(':');
      setSearchOpen(false);
      if (kind === 'place') {
        selectAndFocus({ kind: 'place', id });
      } else if (kind === 'note') {
        const note = geo.located.find((n) => n.noteId === id);
        if (!note) return;
        changeYear(note.year);
        selectAndFocus({ kind: 'place', id: note.placeIds[0] });
      } else if (kind === 'state') {
        const entryPolity = index?.polities.find((p) => polityKey(p) === id);
        if (entryPolity && (roundedYear < entryPolity.f || roundedYear > entryPolity.t)) {
          changeYear(Math.round((entryPolity.f + Math.min(entryPolity.t, PRESENT)) / 2));
        }
        selectAndFocus({ kind: 'state', key: id });
      } else if (kind === 'event' || kind === 'person') {
        const item = kind === 'event' ? context?.events.find((e) => e.id === id) : context?.people.find((p) => p.id === id);
        if (!item) return;
        changeYear('birth' in item ? item.birth + 25 : item.year);
        selectAndFocus({ kind: 'context', id });
      } else if (kind === 'kb' && kb) {
        const item = kb.items[id];
        if (!item) return;
        if (item.f !== undefined) changeYear(item.f);
        if (item.t === 'war') showWar(id);
        selectAndFocus({ kind: 'kb', id });
      } else if (kind === 'city' && cities) {
        // city:Q406@330 — прежнее название: переходим в его годы
        const [cityId, at] = id.split('@');
        const city = cities.byId.get(cityId);
        if (!city) return;
        if (at) changeYear(Number(at));
        else if (!cityExistsAt(city, roundedYear)) changeYear(city.from ?? UNDATED_FROM);
        selectAndFocus({ kind: 'city', id: cityId });
      }
    },
    [selectAndFocus, geo.located, changeYear, index, roundedYear, context, kb, showWar, cities]
  );

  const pickLane = useCallback(
    (bar: LaneBar) => {
      if (bar.target.kind === 'note') navigate(`/note/${bar.target.id}`);
      else if (bar.target.kind === 'ruler') navigate(`/kb/${bar.target.id}`);
      else {
        const item = kb?.items[bar.target.id];
        if (item?.t === 'war') showWar(bar.target.id);
        selectAndFocus({ kind: 'kb', id: bar.target.id });
      }
    },
    [navigate, kb, showWar, selectAndFocus]
  );

  // Клавиши: ← → — год на шаг, пробел — проиграть, Esc — закрыть
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
        // Ползунок — тоже input, но для него стрелки и так двигают год
        if (!(target instanceof HTMLInputElement && target.type === 'range')) return;
        return;
      }
      if (tour && !quiz && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        goStep(tourIndex + (event.key === 'ArrowLeft' ? -1 : 1));
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const delta = event.key === 'ArrowLeft' ? -settings.step : settings.step;
        setPlaying(false);
        setYear((y) => Math.max(bounds.min, Math.min(bounds.max, Math.round(y) + delta)));
      } else if (event.key === ' ') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'Escape') {
        if (selection) close();
        else if (tour) closeTour();
        else if (war) setWar(null);
        setSettingsOpen(false);
        setToursOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settings.step, bounds.min, bounds.max, togglePlay, selection, war, close, tour, quiz, goStep, tourIndex, closeTour]);

  if (geo.index.places.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground">
        В хранилище нет заметок типа <code className="mx-1">place</code> с координатами.
      </div>
    );
  }

  const panelOpen = Boolean(
    selectedPlace || selection?.kind === 'state' || selectedContext || selectedCity || (selection?.kind === 'kb' && kb)
  );
  const statesCount = borders.states.filter((s) => !s.union).length;
  const selectedQid = selectedState ? qidOf(selectedState) : undefined;
  const onBack = history.length > 0 ? back : undefined;
  const shownEvents = contextNow.events.filter((e) => !settings.hiddenEventKinds.includes(e.kind)).length;

  const dismissHints = () => {
    setHintsOpen(false);
    try {
      localStorage.setItem(HINTS_KEY, '1');
    } catch {
      // Не запомнится — покажется ещё раз, не страшно
    }
  };

  const toolbarButton = (active: boolean) =>
    cn(
      'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
      active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
    );

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      {/* При открытой панели шар занимает только видимую часть: иначе выбранное
          место встаёт в центр экрана — ровно под панель */}
      <div
        className={cn(
          'absolute inset-0',
          (panelOpen || meanwhileOpen) && 'bottom-[62%] sm:bottom-0 sm:right-[380px]'
        )}
      >
        <GlobeCanvas
          mode={mode}
          markers={shownMarkers}
          arcs={focused ? [] : arcs}
          states={layers.states ? stateLayers : []}
          background={layers.background ? backgroundLayers : []}
          capitals={capitals}
          cities={cityPoints}
          context={shownContext}
          selection={selection}
          onSelect={(next) => (next ? select(next) : close())}
          autoRotate={!selection && !playing && !war && !tour}
          focus={focus}
          density={DENSITY_FACTOR[settings.density]}
          showLabels={layers.labels}
          spotlight={spotlight}
          lifeLine={lifeLine}
          showGeography={layers.geography}
          insetBottom={bottomInset}
          onPoint={quiz && !quiz.revealed && quiz.index < quiz.steps.length ? answerQuiz : undefined}
        />
      </div>

      {/* Панель инструментов, поиск, настройки */}
      <div className="pointer-events-none absolute left-0 top-0 z-20 flex max-w-full flex-col items-start gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-border/50 bg-card/85 p-1 backdrop-blur-sm">
          <button type="button" onClick={() => setMode('globe')} className={toolbarButton(mode === 'globe')} aria-pressed={mode === 'globe'}>
            <Globe2 className="h-3.5 w-3.5" aria-hidden />
            Шар
          </button>
          <button type="button" onClick={() => setMode('flat')} className={toolbarButton(mode === 'flat')} aria-pressed={mode === 'flat'}>
            <MapIcon className="h-3.5 w-3.5" aria-hidden />
            Карта
          </button>
          <span className="mx-0.5 h-4 w-px bg-border/60" aria-hidden />
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            className={toolbarButton(settingsOpen)}
            aria-expanded={settingsOpen}
            title="Что показывать"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Настройки</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMeanwhileOpen((open) => !open);
              close();
            }}
            className={toolbarButton(meanwhileOpen)}
            aria-expanded={meanwhileOpen}
            title="Что происходило в выбранный год"
          >
            <Clock className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">А в это время</span>
          </button>
          <button
            type="button"
            onClick={() => setLanesOpen((open) => !open)}
            className={toolbarButton(lanesOpen)}
            aria-expanded={lanesOpen}
            title="Ленты: эпохи, течения, войны, правители"
          >
            <ChartGantt className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Ленты</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setToursOpen((open) => !open);
              setSettingsOpen(false);
              setWantKb(true);
            }}
            className={toolbarButton(toursOpen || Boolean(tour))}
            aria-expanded={toursOpen}
            title="Маршруты: главы курса, войны, течения — шаг за шагом по карте"
          >
            <Route className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Маршруты</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchOpen((open) => !open);
              setWantKb(true);
            }}
            className={cn(toolbarButton(searchOpen), 'sm:hidden')}
            aria-expanded={searchOpen}
            aria-label="Поиск"
          >
            <Search className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <GlobeSearch
          entries={searchEntries}
          onPick={pickSearch}
          onFocus={() => setWantKb(true)}
          className={cn('w-[min(360px,calc(100vw-24px))]', !searchOpen && 'hidden sm:block')}
        />

        {toursOpen && (
          <GlobeTourMenu
            groups={tourGroups}
            note={!kb ? (kbMissing ? 'Войны и течения появятся после pnpm kb.' : 'Загружаю войны и течения…') : undefined}
            onPick={startTour}
          />
        )}

        {settingsOpen && (
          <GlobeSettingsPanel
            settings={settings}
            eventKinds={eventKinds}
            peopleGroups={peopleGroups}
            onUpdate={update}
            onLayer={setLayer}
            onReset={reset}
          />
        )}

        {/* Легенда раскраски */}
        {!settingsOpen && legend.length > 0 && (
          <div className="pointer-events-auto hidden w-[240px] rounded-xl border border-border/50 bg-card/90 p-2.5 text-[12px] backdrop-blur-sm sm:block">
            <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              {COLORINGS.find((c) => c.key === settings.coloring)?.label}
            </p>
            <ul className="space-y-0.5">
              {legend.map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: `hsl(${item.hue} ${item.muted ? 12 : 55}% 55%)` }} />
                  <span className="truncate">{item.label}</span>
                </li>
              ))}
              <li className="flex items-center gap-2 text-muted-foreground">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-foreground/15" />
                нет сведений
              </li>
            </ul>
          </div>
        )}

        {/* Обозначения: что за точки и линии — для тех, кто видит карту впервые */}
        {!settingsOpen && !toursOpen && (
          <div className="hidden sm:block">
            <GlobeLegend layers={layers} war={Boolean(war)} />
          </div>
        )}
      </div>

      {/* Режим войны */}
      {warItem && kb && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 top-[60px] z-10 flex justify-center px-3 sm:top-4',
            (panelOpen || meanwhileOpen) && 'sm:right-[380px]'
          )}
        >
          <div className="pointer-events-auto flex max-w-xl items-center gap-2 rounded-xl border border-[#e5484d]/40 bg-card/95 px-3 py-2 text-sm shadow-sm backdrop-blur-sm">
            <Swords className="h-4 w-4 shrink-0 text-[#e5484d]" aria-hidden />
            <button type="button" onClick={() => selectAndFocus({ kind: 'kb', id: war! })} className="min-w-0 truncate text-left">
              <span className="font-medium">{warItem.n}</span>
              <span className="text-muted-foreground">
                {yearsOf(warItem, formatYear) && ` · ${yearsOf(warItem, formatYear)}`}
                {warItem.p && ` · ${warItem.p.length} ${plural(warItem.p.length, 'сторона', 'стороны', 'сторон')}`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowRest((v) => !v)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-pressed={showRest}
              title={showRest ? 'Оставить на карте только войну' : 'Вернуть людей, события, дуги и свои места'}
            >
              {showRest ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
              <span className="hidden sm:inline">{showRest ? 'Только война' : 'Показать всё'}</span>
            </button>
            <button type="button" onClick={() => setWar(null)} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Выйти из режима войны">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Подсказки при первом заходе */}
      {hintsOpen && !panelOpen && !meanwhileOpen && (
        <div className="pointer-events-auto absolute bottom-[104px] left-3 z-10 w-[min(320px,calc(100vw-24px))] rounded-xl border border-border/50 bg-card/95 p-3 text-[13px] shadow-sm backdrop-blur-sm sm:left-4">
          <p className="mb-1.5 font-medium">Как пользоваться</p>
          <ul className="space-y-1 text-muted-foreground">
            <li>Щёлкните по стране, городу или точке — откроется справка.</li>
            <li>Ползунок внизу — год; ‹ › или стрелки — шаг, рядом выбирается 1, 10 или 100 лет; ▶ или пробел — проиграть историю.</li>
            <li>«Ленты» — эпохи, течения и войны рядом по времени.</li>
            <li>Приблизьте — появятся подписи событий, людей и столиц.</li>
            <li>«Настройки» — что показывать и как раскрасить карту.</li>
          </ul>
          <Button size="sm" variant="outline" className="mt-2" onClick={dismissHints}>
            Понятно
          </Button>
        </div>
      )}

      {/* Год и проигрывание: при открытой панели — левее неё, а не под ней */}
      <div
        ref={bottomRef}
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-10 p-2 sm:p-4',
          (panelOpen || meanwhileOpen) && 'sm:right-[380px]',
          (panelOpen || meanwhileOpen) && 'max-sm:hidden'
        )}
      >
        {tour && step && (
          <div className="mx-auto mb-2 flex max-w-3xl">
            <GlobeTour
              tour={tour}
              step={tourIndex}
              readIds={lessonsRead}
              quiz={quiz}
              showRest={showRest}
              onToggleRest={() => setShowRest((v) => !v)}
              onStep={goStep}
              onClose={closeTour}
              onOpenNote={(noteId) => {
                markLessonRead(noteId);
                navigate(`/note/${noteId}`);
              }}
              onDetails={() => step.selection && select(step.selection)}
              onStartQuiz={startQuiz}
              onNextQuestion={nextQuestion}
            />
          </div>
        )}
        {lanesOpen && (
          <GlobeLanes
            year={roundedYear}
            kb={kb}
            kbMissing={kbMissing}
            bands={bands}
            rulers={selectedQid && rulers ? rulers[selectedQid] ?? null : null}
            stateName={selectedState ? stateName(selectedState, roundedYear) : null}
            onPick={pickLane}
          />
        )}
        <GlobeTimeBar
          year={year}
          min={bounds.min}
          max={bounds.max}
          playing={playing}
          step={settings.step}
          speed={settings.speed}
          onStep={(step) => update({ step })}
          onSpeed={(speed) => update({ speed })}
          bands={bands}
          ticks={ticks}
          onYear={changeYear}
          onTogglePlay={togglePlay}
          info={
            <>
              {visible.length} из {geo.located.length} заметок
              {layers.states && statesCount > 0 && (
                <> · {statesCount} {plural(statesCount, 'государство', 'государства', 'государств')}</>
              )}
              {layers.events && shownEvents > 0 && (
                <> · {shownEvents} {plural(shownEvents, 'событие', 'события', 'событий')}</>
              )}
            </>
          }
        />
      </div>

      {/* Боковая панель: выбранное или «а в это время» */}
      {(panelOpen || meanwhileOpen) && (
        <aside
          className={cn(
            'absolute inset-x-0 bottom-0 z-20 flex h-[62%] flex-col border-t border-border/60',
            'bg-card/95 backdrop-blur-sm',
            'sm:inset-y-0 sm:left-auto sm:right-0 sm:h-auto sm:w-[380px] sm:border-l sm:border-t-0'
          )}
        >
          {selectedPlace ? (
            <PlacePanel
              title={selectedPlace.title}
              placeId={selectedPlace.id}
              isRegion={selectedPlace.geo.scale === 'region'}
              year={roundedYear}
              notes={selectedNotes}
              onClose={close}
              onBack={onBack}
              onSelectState={(key) => selectAndFocus({ kind: 'state', key })}
            />
          ) : selection?.kind === 'state' ? (
            <StatePanel
              key={selection.key}
              shape={selectedState}
              year={roundedYear}
              notes={notesByPolity.get(selection.key) ?? []}
              unions={
                selectedState
                  ? borders.states.filter(
                      (shape) =>
                        shape.union &&
                        stateName(shape, roundedYear) !== stateName(selectedState, roundedYear) &&
                        geoContains(shape.area, selectedState.label)
                    )
                  : []
              }
              facts={selectedQid ? facts?.[selectedQid] : undefined}
              rulers={selectedQid ? rulers?.[selectedQid] : undefined}
              onClose={close}
              onBack={onBack}
              onJump={jumpTo}
            />
          ) : selectedContext && context ? (
            <ContextPanel item={selectedContext} context={context} nearby={nearbyNotes} onClose={close} onBack={onBack} />
          ) : selectedCity && cities && cityFacts ? (
            <CityPanel
              city={selectedCity}
              data={cities}
              year={roundedYear}
              facts={cityFacts}
              onClose={close}
              onBack={onBack}
              onSelect={(next) => {
                // Человек из другого века — переносимся в его годы, иначе его точки не будет
                if (next.kind === 'context' && context) {
                  const person = context.people.find((p) => p.id === next.id);
                  const event = context.events.find((e) => e.id === next.id);
                  if (person && !isAlive(person, roundedYear)) changeYear(person.birth + 25);
                  if (event) changeYear(event.year);
                }
                selectAndFocus(next);
              }}
            />
          ) : selection?.kind === 'kb' && kb ? (
            <KbPanel
              key={selection.id}
              id={selection.id}
              kb={kb}
              links={kbLinks}
              onClose={close}
              onBack={onBack}
              onShowWar={showWar}
              onPickPerson={(id) => {
                const person = context?.people.find((p) => p.id === id);
                if (person) {
                  changeYear(person.birth + 25);
                  selectAndFocus({ kind: 'context', id });
                }
              }}
            />
          ) : (
            <MeanwhilePanel
              year={roundedYear}
              located={geo.located}
              states={borders.states}
              context={context}
              onSelect={(next) => {
                selectAndFocus(next);
                setMeanwhileOpen(false);
              }}
              onClose={() => setMeanwhileOpen(false)}
            />
          )}
        </aside>
      )}
    </div>
  );
}
