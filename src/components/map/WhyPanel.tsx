import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  X,
  Route,
  ExternalLink,
  Users,
  Maximize2,
  Minimize2,
  Swords,
} from 'lucide-react';
import type { KnowledgeEdge, KnowledgeGraph, Genealogy, PathResult } from '@/arche/knowledge';
import { RELATION_META } from '@/arche/relations';
import { noteTypeLabel } from '@/arche/noteTypes';
import { formatYear } from '@/arche/timeSpan';
import { firstImageOf } from '@/arche/images';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 420;

interface WhyPanelProps {
  graph: KnowledgeGraph;
  nodeId: string;
  genealogy: Genealogy;
  path: PathResult | null;
  pathFromId: string | null;
  onSelect: (nodeId: string) => void;
  onOpen: (nodeId: string) => void;
  onStartPath: () => void;
  onClearPath: () => void;
  onClose: () => void;
  /** Ширина нужна карте, чтобы не прятать выбранный узел под панелью */
  onWidthChange?: (width: number) => void;
}

function yearLabel(graph: KnowledgeGraph, nodeId: string): string {
  const time = graph.nodeById.get(nodeId)?.time;
  if (!time) return '';
  return formatYear(time.startYear, time.precision);
}

interface StepListProps {
  graph: KnowledgeGraph;
  steps: Array<{ edge: KnowledgeEdge; nodeId: string; depth: number }>;
  onSelect: (nodeId: string) => void;
}

function StepList({ graph, steps, onSelect }: StepListProps) {
  return (
    <ul className="space-y-1">
      {steps.map((step) => {
        const node = graph.nodeById.get(step.nodeId);
        if (!node) return null;
        const meta = RELATION_META[step.edge.kind];
        const image = firstImageOf(node.note.body);

        return (
          <li key={`${step.edge.id}-${step.nodeId}`}>
            <button
              type="button"
              onClick={() => onSelect(step.nodeId)}
              className="group flex w-full gap-2.5 rounded-md py-2 pr-2 text-left transition-colors hover:bg-accent/60"
              // Отступ вложенности задаём padding'ом, а не margin'ом:
              // margin при w-full делает элемент шире контейнера и рождает
              // горизонтальную полосу прокрутки внизу панели
              style={{ paddingLeft: 8 + Math.min(step.depth - 1, 2) * 12 }}
            >
              {image ? (
                <img
                  src={image}
                  alt=""
                  loading="lazy"
                  className="mt-0.5 h-9 w-9 shrink-0 rounded object-cover"
                />
              ) : (
                <span
                  className="mt-2 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: meta.color }}
                  aria-hidden
                />
              )}

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-serif text-[15px] leading-snug group-hover:underline">
                    {node.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {yearLabel(graph, step.nodeId)}
                  </span>
                </span>
                {step.edge.labels[0] && (
                  <span className="mt-0.5 block break-words text-[13px] leading-snug text-muted-foreground">
                    {step.edge.labels[0]}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Section({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
        {hint && <span className="tracking-normal opacity-70">· {hint}</span>}
      </h3>
      {children}
    </section>
  );
}

export function WhyPanel({
  graph,
  nodeId,
  genealogy,
  path,
  pathFromId,
  onSelect,
  onOpen,
  onStartPath,
  onClearPath,
  onClose,
  onWidthChange,
}: WhyPanelProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [fullscreen, setFullscreen] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    onWidthChange?.(fullscreen ? Number.POSITIVE_INFINITY : width);
  }, [width, fullscreen, onWidthChange]);

  // Перетаскивание левого края. Слушатели вешаем на window,
  // иначе курсор «убегает» с узкой полоски и тянуть перестаёт
  const startResize = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    resizeRef.current = { startX: event.clientX, startWidth: width };

    const onMove = (e: PointerEvent) => {
      const state = resizeRef.current;
      if (!state) return;
      const next = state.startWidth - (e.clientX - state.startX);
      setWidth(Math.max(MIN_WIDTH, Math.min(next, window.innerWidth - 80)));
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [width]);

  const node = graph.nodeById.get(nodeId);
  if (!node) return null;

  const time = node.time;
  const period = time
    ? time.endYear !== undefined
      ? `${formatYear(time.startYear, time.precision)} — ${formatYear(time.endYear, time.precision)}`
      : formatYear(time.startYear, time.precision)
    : 'вне времени';

  const image = firstImageOf(node.note.body);

  // Противостояние показываем отдельно: это не «откуда» и не «куда»,
  // а напряжение, из которого обычно и рождается следующий шаг
  const opposing = (graph.adjacent.get(nodeId) ?? []).filter((e) => e.kind === 'opposes');
  const ancestors = genealogy.ancestors.filter((s) => s.edge.kind !== 'opposes');
  const descendants = genealogy.descendants.filter((s) => s.edge.kind !== 'opposes');

  return (
    <aside
      className={cn(
        'absolute inset-y-0 right-0 z-20 flex flex-col border-l border-border/60 bg-card/95 backdrop-blur-sm',
        fullscreen && 'left-0'
      )}
      style={fullscreen ? undefined : { width }}
      aria-label={`Почему возник: ${node.title}`}
    >
      {/* Полоса для изменения ширины */}
      {!fullscreen && (
        <div
          onPointerDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Изменить ширину панели"
          className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-primary/20"
        />
      )}

      <header className="space-y-3 border-b border-border/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            {image && (
              <img
                src={image}
                alt=""
                className="h-14 w-14 shrink-0 rounded-md object-cover"
              />
            )}
            <div className="min-w-0">
              <h2 className="break-words font-serif text-2xl leading-tight">{node.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {noteTypeLabel(node.type)} · {period}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFullscreen(!fullscreen)}
              aria-label={fullscreen ? 'Свернуть панель' : 'Развернуть на весь экран'}
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть панель">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onOpen(nodeId)} className="flex-1">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Открыть
          </Button>
          {pathFromId ? (
            <Button size="sm" variant="secondary" onClick={onClearPath} className="flex-1">
              Сбросить путь
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onStartPath} className="flex-1">
              <Route className="mr-1.5 h-3.5 w-3.5" />
              Путь отсюда
            </Button>
          )}
        </div>

        {pathFromId === nodeId && !path && (
          <p className="text-sm text-muted-foreground">
            Выберите вторую заметку — построю цепочку между ними.
          </p>
        )}
      </header>

      {/* overflow-x-hidden обязателен: длинные названия иначе растягивают
          панель и внизу появляется горизонтальная полоса прокрутки */}
      <div
        className={cn(
          'flex-1 overflow-y-auto overflow-x-hidden p-4',
          fullscreen ? 'columns-1 gap-8 lg:columns-2 [&>section]:break-inside-avoid' : 'space-y-6'
        )}
      >
        {path && path.edges.length > 0 && (
          <Section title="Цепочка" icon={<Route className="h-3.5 w-3.5" />}>
            <ol className="space-y-1">
              {path.nodeIds.map((id, index) => {
                const stepNode = graph.nodeById.get(id);
                const edge = path.edges[index];
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onSelect(id)}
                      className="break-words text-left font-serif text-[15px] hover:underline"
                    >
                      {stepNode?.title}
                    </button>
                    {edge && (
                      <div className="flex items-baseline gap-1.5 py-0.5 pl-2 text-[13px] text-muted-foreground">
                        <span
                          className="h-3 w-px shrink-0"
                          style={{ background: RELATION_META[edge.kind].color }}
                          aria-hidden
                        />
                        <span style={{ color: RELATION_META[edge.kind].color }}>
                          {RELATION_META[edge.kind].label}
                        </span>
                        {edge.labels[0] && <span className="break-words opacity-80">— {edge.labels[0]}</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </Section>
        )}

        {ancestors.length > 0 && (
          <Section title="Возникло из" hint={`${ancestors.length}`} icon={<ArrowLeft className="h-3.5 w-3.5" />}>
            <StepList graph={graph} steps={ancestors} onSelect={onSelect} />
          </Section>
        )}

        {descendants.length > 0 && (
          <Section title="Привело к" hint={`${descendants.length}`} icon={<ArrowRight className="h-3.5 w-3.5" />}>
            <StepList graph={graph} steps={descendants} onSelect={onSelect} />
          </Section>
        )}

        {opposing.length > 0 && (
          <Section title="Противостоит" icon={<Swords className="h-3.5 w-3.5" />}>
            <StepList
              graph={graph}
              steps={opposing.map((edge) => ({
                edge,
                nodeId: edge.sourceId === nodeId ? edge.targetId : edge.sourceId,
                depth: 1,
              }))}
              onSelect={onSelect}
            />
          </Section>
        )}

        {genealogy.contemporaries.length > 0 && (
          <Section title="Современники" icon={<Users className="h-3.5 w-3.5" />}>
            <StepList graph={graph} steps={genealogy.contemporaries} onSelect={onSelect} />
          </Section>
        )}

        {ancestors.length === 0 && descendants.length === 0 && (
          <p className="text-sm text-muted-foreground">
            У этой заметки пока нет причинных связей. Добавьте в раздел «Связи» ссылки
            с описанием — например «то, от чего происходит переход» или «ответ на кризис».
          </p>
        )}
      </div>
    </aside>
  );
}

export { DEFAULT_WIDTH as PANEL_DEFAULT_WIDTH };
export type { WhyPanelProps };
