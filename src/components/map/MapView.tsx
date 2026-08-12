import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Maximize2, HelpCircle, List, Network } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { useIsNarrow } from '@/hooks/useIsNarrow';
import { cn } from '@/lib/utils';
import { traceGenealogy, findPath, type KnowledgeEdge, type KnowledgeNode } from '@/arche/knowledge';
import { RELATION_KINDS, RELATION_META, type RelationKind } from '@/arche/relations';
import { NOTE_TYPES_ORDERED } from '@/arche/noteTypes';
import { collectDomains, collectTypes } from '@/arche/search';
import { Button } from '@/components/ui/button';
import { MapCanvas } from './MapCanvas';
import { MapTimeline } from './MapTimeline';
import { MapLegend } from './MapLegend';
import { WhyPanel, PANEL_DEFAULT_WIDTH } from './WhyPanel';
import { NodeHoverCard } from './NodeHoverCard';
import {
  computeMapLayout,
  laneByType,
  laneLabelByType,
  laneOrderByType,
  type Camera,
} from './mapLayout';
import type { Epoch } from './mapRender';

interface MapViewProps {
  onOpenNote: (noteId: string) => void;
}

const DEFAULT_KINDS = new Set<RelationKind>(RELATION_KINDS);

/** Схема или лента. На телефоне по умолчанию лента — схема там нечитаема */
type MapMode = 'canvas' | 'timeline';

export function MapView({ onOpenNote }: MapViewProps) {
  const notes = useArcheStore((state) => state.notes);
  const [searchParams, setSearchParams] = useSearchParams();
  const narrow = useIsNarrow();
  // null — «как решит ширина экрана»; после выбора руками решение за пользователем
  const [modeOverride, setModeOverride] = useState<MapMode | null>(null);
  const mode: MapMode = modeOverride ?? (narrow ? 'timeline' : 'canvas');

  const [camera, setCamera] = useState<Camera>({ centerYear: 800, pxPerYear: 0.5 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<{ id: string; x: number; y: number } | null>(null);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('focus'));
  const [pathFromId, setPathFromId] = useState<string | null>(null);
  const [activeKinds, setActiveKinds] = useState<Set<RelationKind>>(DEFAULT_KINDS);
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [activeDomains, setActiveDomains] = useState<string[]>([]);
  const fittedRef = useRef(false);

  const graph = useArcheStore((state) => state.knowledgeGraph);

  const availableTypes = useMemo(() => {
    const present = new Set(collectTypes(notes));
    return NOTE_TYPES_ORDERED.filter((type) => present.has(type)) as string[];
  }, [notes]);

  const availableDomains = useMemo(() => collectDomains(notes), [notes]);

  /** Эпохи для фона берём из самих заметок типа time, а не из константы в коде */
  const epochs = useMemo<Epoch[]>(() => {
    return graph.nodes
      .filter((n) => n.type === 'time' && n.time?.endYear !== undefined)
      .map((n) => ({ name: n.title, startYear: n.time!.startYear, endYear: n.time!.endYear! }))
      .sort((a, b) => a.startYear - b.startYear);
  }, [graph]);

  const visibleNodes = useMemo<KnowledgeNode[]>(() => {
    return graph.nodes.filter((node) => {
      if (!node.time) return false;
      if (activeTypes.length > 0 && !activeTypes.includes(node.type ?? '')) return false;
      if (activeDomains.length > 0) {
        const domains = node.note.domain ?? [];
        if (!domains.some((d) => activeDomains.includes(d))) return false;
      }
      return true;
    });
  }, [graph, activeTypes, activeDomains]);

  const layout = useMemo(
    () =>
      computeMapLayout(visibleNodes, {
        pxPerYear: camera.pxPerYear,
        laneOf: laneByType,
        laneLabel: laneLabelByType,
        laneOrder: laneOrderByType,
      }),
    [visibleNodes, camera.pxPerYear]
  );

  const dataRange = useMemo(() => {
    const years = visibleNodes.map((n) => n.time!.displayYear);
    if (years.length === 0) return null;
    return { min: Math.min(...years), max: Math.max(...years) };
  }, [visibleNodes]);

  const fitToData = useCallback(() => {
    if (!dataRange || viewport.width === 0) return;
    const span = Math.max(50, dataRange.max - dataRange.min);
    setCamera({
      centerYear: (dataRange.min + dataRange.max) / 2,
      pxPerYear: (viewport.width * 0.82) / span,
    });
  }, [dataRange, viewport.width]);

  // Первая укладка: вписываем всю историю в экран
  useEffect(() => {
    if (fittedRef.current || viewport.width === 0 || !dataRange) return;
    fittedRef.current = true;
    fitToData();
  }, [fitToData, viewport.width, dataRange]);

  const genealogy = useMemo(
    () => (selectedId ? traceGenealogy(graph, selectedId, 3) : null),
    [graph, selectedId]
  );

  const path = useMemo(() => {
    if (!pathFromId || !selectedId || pathFromId === selectedId) return null;
    return findPath(graph, pathFromId, selectedId);
  }, [graph, pathFromId, selectedId]);

  /** Что подсвечено и какие рёбра рисуем */
  const visual = useMemo(() => {
    const pathEdges = new Set(path?.edges.map((e) => e.id) ?? []);
    const pathEndpoints = new Set<string>();
    if (pathFromId) pathEndpoints.add(pathFromId);
    if (path && selectedId) pathEndpoints.add(selectedId);

    let spotlight: Set<string> | null = null;
    let edges: KnowledgeEdge[] = [];

    if (path) {
      spotlight = new Set(path.nodeIds);
      edges = path.edges;
    } else if (selectedId && genealogy) {
      const lit = new Set(genealogy.involved);
      const unique = new Map<string, KnowledgeEdge>();

      // Рёбра самой родословной. Если брать все связи между задействованными
      // узлами, у центральных понятий получается клубок, из которого ничего
      // не прочитать.
      const traced = [...genealogy.ancestors, ...genealogy.descendants, ...genealogy.contemporaries];
      traced.forEach((step) => {
        if (activeKinds.has(step.edge.kind)) unique.set(step.edge.id, step.edge);
      });

      // Плюс собственные связи выбранного узла — ЛЮБЫЕ, а не только причинные.
      // Родословная прослеживается лишь по причинным видам, и у заметки, где
      // их нет (места связаны через «эпоха», «контекст», «связано с»), клик
      // показывал пустоту там, где наведение показывало десяток связей.
      for (const edge of graph.adjacent.get(selectedId) ?? []) {
        if (!activeKinds.has(edge.kind)) continue;
        unique.set(edge.id, edge);
        lit.add(edge.sourceId);
        lit.add(edge.targetId);
      }

      spotlight = lit;
      edges = [...unique.values()];
    } else if (hovered) {
      const neighbours = graph.adjacent.get(hovered.id) ?? [];
      const lit = new Set<string>([hovered.id]);
      neighbours.forEach((e) => {
        lit.add(e.sourceId);
        lit.add(e.targetId);
      });
      spotlight = lit;
      edges = neighbours.filter((e) => activeKinds.has(e.kind));
    }

    return {
      focusedId: selectedId,
      hoveredId: hovered?.id ?? null,
      spotlight,
      edges,
      pathEdges,
      pathEndpoints,
    };
  }, [graph, selectedId, hovered, genealogy, path, pathFromId, activeKinds]);

  // Выбранный узел живёт в URL — ссылкой можно поделиться
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedId) next.set('focus', selectedId);
    else next.delete('focus');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [selectedId, searchParams, setSearchParams]);

  /** Центрируем камеру на узле, если он вне экрана */
  const revealNode = useCallback(
    (nodeId: string) => {
      const node = graph.nodeById.get(nodeId);
      if (!node?.time) return;
      const halfSpan = viewport.width / 2 / camera.pxPerYear;
      const year = node.time.displayYear;
      if (Math.abs(year - camera.centerYear) > halfSpan * 0.7) {
        setCamera((current) => ({ ...current, centerYear: year }));
      }
    },
    [graph, viewport.width, camera.pxPerYear, camera.centerYear]
  );

  const handleSelect = useCallback(
    (nodeId: string | null) => {
      setSelectedId(nodeId);
      if (nodeId) revealNode(nodeId);
    },
    [revealNode]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedId(null);
        setPathFromId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const toggleKind = (kind: RelationKind) => {
    setActiveKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const toggleInList = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const hoveredNode = hovered ? graph.nodeById.get(hovered.id) : null;
  // При развёрнутой на весь экран панели карта не нужна вовсе. На телефоне
  // панель всегда во всю ширину, и без этого лента под ней продолжала бы
  // раскладываться в нулевой ширине
  const contentHidden = selectedId !== null && !Number.isFinite(panelWidth);

  return (
    <div className="relative h-full w-full bg-background">
      {/* Освобождаем место под панель, чтобы выбранный узел не оказался за ней */}
      <div
        className="absolute inset-y-0 left-0"
        style={{ right: selectedId ? (Number.isFinite(panelWidth) ? panelWidth : '100%') : 0 }}
      >
        {contentHidden ? null : mode === 'canvas' ? (
          <MapCanvas
            layout={layout}
            camera={camera}
            onCameraChange={setCamera}
            epochs={epochs}
            visual={visual}
            onHover={(id, position) => setHovered(id && position ? { id, ...position } : null)}
            onSelect={handleSelect}
            onOpen={onOpenNote}
            onViewportChange={setViewport}
          />
        ) : (
          <MapTimeline
            graph={graph}
            nodes={visibleNodes}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        )}
      </div>

      {mode === 'canvas' && hovered && hoveredNode && hoveredNode.id !== selectedId && (
        <NodeHoverCard graph={graph} node={hoveredNode} position={hovered} />
      )}

      {/* Управление держим внизу справа: сверху идут подписи эпох, нарисованные на канвасе */}
      {!selectedId && (
        <div
          className={cn(
            'absolute right-3 z-20 flex max-w-xs flex-col items-end gap-2',
            mode === 'canvas' ? 'bottom-12' : 'bottom-3'
          )}
        >
          {/* Переключатель показываем всегда, а не только на телефоне:
              канвас недоступен с клавиатуры и для скринридера, а лента —
              единственный способ пользоваться картой без мыши */}
          {
            <div className="flex rounded-lg border border-border/60 bg-card/90 p-0.5 backdrop-blur-sm">
              {(
                [
                  { key: 'timeline', label: 'Лента', icon: List },
                  { key: 'canvas', label: 'Схема', icon: Network },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setModeOverride(key)}
                  aria-pressed={mode === key}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
                    mode === key ? 'bg-accent text-foreground' : 'text-muted-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          }

          {mode === 'canvas' && (
            <Button variant="outline" size="sm" onClick={fitToData} title="Вписать всю историю в экран">
              <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
              Вся история
            </Button>
          )}

          {/* Подсказка про мышь на телефоне бессмысленна и только занимает место */}
          {!narrow && mode === 'canvas' && (
            <div className="pointer-events-none rounded-lg border border-border/50 bg-card/80 px-3 py-2 text-xs text-muted-foreground backdrop-blur-sm">
              <p className="flex items-center gap-1.5 text-foreground/80">
                <HelpCircle className="h-3.5 w-3.5" />
                Клик по узлу — почему он возник
              </p>
              <p className="mt-1">Колесо — масштаб, перетаскивание — движение по времени</p>
            </div>
          )}
        </div>
      )}

      {!contentHidden && (
      <MapLegend
        atBottom={mode === 'canvas' ? 48 : 12}
        showKinds={mode === 'canvas'}
        activeKinds={activeKinds}
        onToggleKind={toggleKind}
        availableTypes={availableTypes}
        activeTypes={activeTypes}
        onToggleType={(type) => setActiveTypes((list) => toggleInList(list, type))}
        availableDomains={availableDomains}
        activeDomains={activeDomains}
        onToggleDomain={(domain) => setActiveDomains((list) => toggleInList(list, domain))}
        onReset={() => {
          setActiveKinds(new Set(RELATION_KINDS));
          setActiveTypes([]);
          setActiveDomains([]);
        }}
      />
      )}

      {selectedId && genealogy && (
        <WhyPanel
          onWidthChange={setPanelWidth}
          graph={graph}
          nodeId={selectedId}
          genealogy={genealogy}
          path={path}
          pathFromId={pathFromId}
          onSelect={handleSelect}
          onOpen={onOpenNote}
          onStartPath={() => setPathFromId(selectedId)}
          onClearPath={() => setPathFromId(null)}
          onClose={() => {
            setSelectedId(null);
            setPathFromId(null);
          }}
        />
      )}
    </div>
  );
}

export { RELATION_META };
