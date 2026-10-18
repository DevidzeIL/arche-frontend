import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { geoContains, geoDistance } from 'd3-geo';
import { ChartGantt, Clock, Globe2, Map as MapIcon, Search, Settings2, Swords, X } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { normalizeTitle } from '@/arche/normalize';
import { notesByPlace, placesForGraph } from '@/arche/geo';
import { RELATION_META } from '@/arche/relations';
import { formatYear } from '@/arche/timeSpan';
import { loadBordersIndex, polityOfPlace, stateName, useBordersAt } from '@/arche/borders';
import { polityKey, type BordersIndex } from '@/arche/bordersData';
import { categoryOf, COLORINGS, type Coloring } from '@/arche/coloring';
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
  type GlobeSelection,
  type StateLayer,
} from './GlobeCanvas';
import {
  ContextPanel,
  KbPanel,
  MeanwhilePanel,
  PlacePanel,
  PRESENT,
  StatePanel,
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
  const [params, setParams] = useSearchParams();
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
  const [selection, setSelection] = useState<GlobeSelection | null>(() => selectionFromParams(initial.current));
  const [history, setHistory] = useState<GlobeSelection[]>([]);
  const [mode, setMode] = useState<GlobeMode>(initial.current.get('mode') === 'flat' ? 'flat' : 'globe');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [meanwhileOpen, setMeanwhileOpen] = useState(false);
  const [war, setWar] = useState<string | null>(initial.current.get('war'));
  const [hintsOpen, setHintsOpen] = useState(() => !seenHints());
  const [lanesOpen, setLanesOpen] = useState(false);
  const navigate = useNavigate();
  const [focus, setFocus] = useState<{ lon: number; lat: number; token: number } | null>(null);
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

  // Состояние — в адрес: таким видом можно поделиться ссылкой
  const roundedYear = Math.round(year);
  useEffect(() => {
    if (playing) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams();
      next.set('year', String(roundedYear));
      if (mode === 'flat') next.set('mode', 'flat');
      if (settings.coloring !== 'states') next.set('color', settings.coloring);
      if (war) next.set('war', war);
      if (selection?.kind === 'place') next.set('place', selection.id);
      if (selection?.kind === 'state') next.set('state', selection.key);
      if (selection?.kind === 'context') next.set('item', selection.id);
      if (selection?.kind === 'kb') next.set('kb', selection.id);
      setParams(next, { replace: true });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [roundedYear, mode, settings.coloring, war, selection, playing, setParams]);

  // Проигрывание истории: год ползёт от начала к концу
  useEffect(() => {
    if (!playing) return;
    const span = bounds.max - bounds.min;
    if (span <= 0) return;

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
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
  }, [playing, bounds.min, bounds.max, settings.speed]);

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
    if (!layers.events && !layers.people && !meanwhileOpen && selection?.kind !== 'context') return;
    let alive = true;
    loadContext().then((data) => {
      if (!alive || !data) return;
      const titles = new Set(notes.map((note) => normalizeTitle(note.title)));
      setContext(withoutVaultDuplicates(data, titles));
    });
    return () => {
      alive = false;
    };
  }, [layers.events, layers.people, meanwhileOpen, selection, notes]);

  // База знаний: для поиска, войн и справок — грузится, когда понадобилась
  const [kb, setKb] = useState<Kb | null>(null);
  /** База не собрана (pnpm kb) — сказать об этом, а не «загружаю» вечно */
  const [kbMissing, setKbMissing] = useState(false);
  const [kbLinks, setKbLinks] = useState<KbLinks | null>(null);
  const [wantKb, setWantKb] = useState(Boolean(initial.current.get('war') || initial.current.get('kb')));
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
        return { place, count, weight: count / max };
      })
      // Пустое место на глобусе — просто шум: пока там ничего не произошло,
      // показывать нечего
      .filter((marker) => marker.count > 0);
  }, [geo.index.places, visible]);

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
          hue: category?.hue ?? shape.hue,
          nodata: settings.coloring !== 'states' && !category,
          category: category?.label,
          muted: category?.muted,
          emphasis: warItem ? (qid && warParticipants.has(qid) ? 'on' : 'off') : undefined,
        };
      }),
    [borders.states, roundedYear, facts, settings.coloring, warItem, warParticipants]
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
      out.push({
        key: shape.key,
        name: capital.name,
        state: stateName(shape, roundedYear),
        lon: capital.lon,
        lat: capital.lat,
      });
    }
    return out;
  }, [facts, borders.states, roundedYear, layers.capitals, layers.states]);

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
      }
      if (at) setFocus({ lon: at[0], lat: at[1], token: Date.now() });
    },
    [select, context, borders.states, geo.index.byId, kb]
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
  }, [geo.index.places, geo.located, index, context, kb]);

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
      }
    },
    [selectAndFocus, geo.located, changeYear, index, roundedYear, context, kb, showWar]
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
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const delta = event.key === 'ArrowLeft' ? -settings.step : settings.step;
        setPlaying(false);
        setYear((y) => Math.max(bounds.min, Math.min(bounds.max, Math.round(y) + delta)));
      } else if (event.key === ' ') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'Escape') {
        if (selection) close();
        else if (war) setWar(null);
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settings.step, bounds.min, bounds.max, togglePlay, selection, war, close]);

  if (geo.index.places.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground">
        В хранилище нет заметок типа <code className="mx-1">place</code> с координатами.
      </div>
    );
  }

  const panelOpen = Boolean(
    selectedPlace || selection?.kind === 'state' || selectedContext || (selection?.kind === 'kb' && kb)
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
          markers={markers}
          arcs={arcs}
          states={layers.states ? stateLayers : []}
          background={layers.background ? backgroundLayers : []}
          capitals={capitals}
          context={contextPoints}
          selection={selection}
          onSelect={(next) => (next ? select(next) : close())}
          autoRotate={!selection && !playing && !war}
          focus={focus}
          density={DENSITY_FACTOR[settings.density]}
          showLabels={layers.labels}
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
            <li>Ползунок внизу — год; ‹ › или стрелки — шаг; ▶ или пробел — проиграть историю.</li>
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
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-10 p-2 sm:p-4',
          (panelOpen || meanwhileOpen) && 'sm:right-[380px]',
          (panelOpen || meanwhileOpen) && 'max-sm:hidden'
        )}
      >
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
